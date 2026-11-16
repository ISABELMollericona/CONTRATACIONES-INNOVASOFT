import { getServerSession } from "next-auth";
import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin";
import { notifyAdministrators } from "@/lib/admin-notifications";
import { connectDb } from "@/lib/db";
import { formatDocument } from "@/lib/identity";
import { Contract } from "@/lib/models";

const actionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("validate"), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal("reject"), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal("note"), note: z.string().trim().min(1).max(1000) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const now = new Date();

  if (parsed.data.decision === "note") {
    const contract = await Contract.findByIdAndUpdate(
      id,
      { $push: { audit: { event: "admin_note", by: admin.user.email, at: now, note: parsed.data.note } } },
      { new: true },
    );
    if (!contract) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
    return NextResponse.json({ saved: true });
  }

  const isValid = parsed.data.decision === "validate";
  const contract = await Contract.findOneAndUpdate(
    { _id: id, paymentStatus: "pending_review", status: "pending_review" },
    {
      $set: {
        paymentStatus: isValid ? "validated" : "rejected",
        status: isValid ? "active" : "pending_payment",
      },
      $push: {
        audit: {
          event: isValid ? "payment_validated" : "payment_rejected",
          by: admin.user.email,
          at: now,
          note: parsed.data.note ?? "",
        },
      },
    },
    { new: true },
  );
  if (!contract) return NextResponse.json({ error: "El comprobante ya fue procesado o no está pendiente." }, { status: 409 });
  const notification = await notifyAdministrators(isValid ? "payment_validated" : "payment_rejected", {
    id: String(contract._id),
    code: contract.code,
    customerName: contract.customer.name,
    customerEmail: contract.customer.email,
    customerPhone: contract.customer.phone,
    productName: contract.selection.productName,
    planName: contract.selection.planName,
    total: contract.pricing.total,
    createdAt: contract.createdAt,
  });
  return NextResponse.json({
    status: contract.status,
    paymentStatus: contract.paymentStatus,
    emailNotificationSent: notification.sent,
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const isAdmin = session.user.role === "admin";
  const filter = isAdmin ? { _id: id } : { _id: id, ownerEmail: session.user.email.toLowerCase() };
  const contract = await Contract.findOne(filter).lean();
  if (!contract) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  const customerDocument = formatDocument({
    type: contract.customer.documentType,
    number: contract.customer.documentNumber,
    complement: contract.customer.documentComplement,
    issuedIn: contract.customer.documentIssuedIn,
  });
  return NextResponse.json({
    id: String(contract._id),
    code: contract.code,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    ownerEmail: contract.ownerEmail,
    status: contract.status,
    paymentStatus: contract.paymentStatus,
    selection: contract.selection,
    customer: contract.customer,
    customerDocument,
    pricing: contract.pricing,
    signedAt: contract.signedAt,
    signerName: contract.signerName,
    signerDocument: contract.signerDocument,
    signerDocumentText: contract.signerDocument?.number ? formatDocument(contract.signerDocument) : customerDocument,
    signatureImage: contract.signatureImage,
    signatureHash: contract.signatureHash,
    hasIdentityPhotos: Boolean(contract.identityPhotos?.front?.publicId),
    identityPhotos: {
      front: contract.identityPhotos?.front?.publicId ? { format: contract.identityPhotos.front.format, uploadedAt: contract.identityPhotos.front.uploadedAt } : null,
      back: contract.identityPhotos?.back?.publicId ? { format: contract.identityPhotos.back.format, uploadedAt: contract.identityPhotos.back.uploadedAt } : null,
    },
    receipt: contract.receipt?.publicId ? { format: contract.receipt.format, uploadedAt: contract.receipt.uploadedAt } : null,
    contractClauses: contract.contractClauses,
    readConfirmedAt: contract.readConfirmedAt,
    documentHash: contract.documentHash,
    terms: contract.termsSnapshot,
    audit: isAdmin ? (contract.audit ?? []).map((item) => ({ event: item.event, by: item.by, at: item.at, note: item.note })) : undefined,
  });
}
