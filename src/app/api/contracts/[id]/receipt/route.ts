import { isValidObjectId } from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { notifyAdministrators } from "@/lib/admin-notifications";
import { connectDb } from "@/lib/db";
import { Contract } from "@/lib/models";
import { detectMime, storageAvailable, storePrivateFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo JPG, PNG o PDF." }, { status: 400 });
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo debe tener un tamaño máximo de 5 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(bytes);
  if (!mime || mime !== file.type) {
    return NextResponse.json({ error: "El contenido no coincide con un PDF, JPG o PNG permitido." }, { status: 400 });
  }
  if (!storageAvailable()) {
    return NextResponse.json({ error: "La carga privada de comprobantes aún no está configurada." }, { status: 503 });
  }

  await connectDb();
  const contract = await Contract.findOne({
    _id: id,
    ownerEmail: session.user.email.toLowerCase(),
    status: { $in: ["pending_payment", "rejected"] },
    paymentStatus: { $in: ["unpaid", "rejected"] },
  });
  if (!contract) return NextResponse.json({ error: "No se encontró una contratación pendiente para tu cuenta." }, { status: 404 });

  try {
    contract.receipt = await storePrivateFile(bytes, mime, "comprobantes", `receipt-${contract.code.toLowerCase()}`);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el comprobante. Intenta nuevamente." }, { status: 502 });
  }
  contract.paymentStatus = "pending_review";
  contract.status = "pending_review";
  contract.audit.push({ event: "receipt_uploaded", by: session.user.email, at: new Date(), note: "Comprobante recibido; requiere validación manual." });
  await contract.save();
  const notification = await notifyAdministrators("receipt_uploaded", {
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
  return NextResponse.json({ status: contract.paymentStatus, emailNotificationSent: notification.sent });
}
