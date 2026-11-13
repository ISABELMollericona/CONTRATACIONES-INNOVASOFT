import { getServerSession } from "next-auth";
import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin";
import { connectDb } from "@/lib/db";
import { Contract } from "@/lib/models";

const decisionSchema = z.object({
  decision: z.enum(["validate", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const now = new Date();
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
  return NextResponse.json({ status: contract.status, paymentStatus: contract.paymentStatus });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const filter = session.user.role === "admin" ? { _id: id } : { _id: id, ownerEmail: session.user.email.toLowerCase() };
  const contract = await Contract.findOne(filter).lean();
  if (!contract) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  return NextResponse.json({
    id: String(contract._id),
    code: contract.code,
    status: contract.status,
    paymentStatus: contract.paymentStatus,
    selection: contract.selection,
    customer: contract.customer,
    pricing: contract.pricing,
    signedAt: contract.signedAt,
    signerName: contract.signerName,
    signerDocument: contract.signerDocument,
    signatureImage: contract.signatureImage,
    signatureHash: contract.signatureHash,
    hasIdentityPhotos: Boolean(contract.identityPhotos?.front?.publicId),
    contractClauses: contract.contractClauses,
    readConfirmedAt: contract.readConfirmedAt,
    documentHash: contract.documentHash,
    terms: contract.termsSnapshot,
  });
}
