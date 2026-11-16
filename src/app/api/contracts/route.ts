import { createHash, randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { buildContractClauses } from "@/lib/contract-text";
import { connectDb } from "@/lib/db";
import { DOCUMENT_TYPES, ISSUED_IN_OPTIONS, formatDocument, signatureImageSchema, signerDocumentSchema } from "@/lib/identity";
import { Contract, Settings } from "@/lib/models";
import { formatPromotionEnd, resolveOffer } from "@/lib/offer";
import { qrForAmount } from "@/lib/qr";
import { imageFromDataUrl, storageAvailable, storePrivateFile } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_ID_PHOTO_BYTES = 4 * 1024 * 1024;
const idPhotoSchema = z.string().max(Math.ceil(MAX_ID_PHOTO_BYTES * 1.4)).regex(/^data:image\/(jpeg|png);base64,/);

const contractSchema = z.object({
  productSlug: z.string().min(1),
  planId: z.string().min(1),
  mode: z.string().min(1),
  siatOption: z.enum(["with", "without"]),
  duration: z.number().int().positive(),
  extraBranches: z.number().int().min(0).max(50).optional(),
  promotionCode: z.string().trim().optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    documentType: z.enum(DOCUMENT_TYPES),
    documentNumber: z.string().trim().min(3).max(40),
    documentComplement: z.string().trim().max(5).optional(),
    documentIssuedIn: z.enum(ISSUED_IN_OPTIONS.map((option) => option.value) as [string, ...string[]]).or(z.literal("")).optional(),
    phone: z.string().trim().min(6).max(30),
    email: z.string().email().max(254),
    businessName: z.string().trim().max(120).optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
  }),
  signerName: z.string().trim().min(2).max(120),
  signerDocument: signerDocumentSchema,
  signatureImage: signatureImageSchema,
  identityPhotos: z.object({ front: idPhotoSchema, back: idPhotoSchema }),
  readFullContract: z.literal(true),
  acceptedTerms: z.literal(true),
});

function errorFor(path: string) {
  if (path.startsWith("siatOption")) return "Elige si tu contratación será con SIAT o sin SIAT.";
  if (path.startsWith("signatureImage")) return "Dibuja tu firma en el recuadro antes de continuar.";
  if (path.startsWith("signerDocument")) return "Revisa el documento de identidad de quien firma.";
  if (path.startsWith("identityPhotos")) return "Sube las fotos del anverso y reverso de tu carnet (JPG o PNG, máximo 4 MB cada una).";
  if (path.startsWith("readFullContract")) return "Debes leer el contrato completo hasta el final antes de aceptarlo.";
  if (path.startsWith("acceptedTerms")) return "Debes aceptar las condiciones del contrato.";
  return "Revisa los datos del cliente y acepta las condiciones.";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  const parsed = contractSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: errorFor(parsed.error.issues[0]?.path.join(".") ?? "") }, { status: 400 });
  }
  const input = parsed.data;
  const front = imageFromDataUrl(input.identityPhotos.front, MAX_ID_PHOTO_BYTES);
  const back = imageFromDataUrl(input.identityPhotos.back, MAX_ID_PHOTO_BYTES);
  if (!front || !back) return NextResponse.json({ error: errorFor("identityPhotos") }, { status: 400 });
  if (!storageAvailable()) return NextResponse.json({ error: "La carga privada de archivos aún no está configurada." }, { status: 503 });

  await connectDb();
  const offer = await resolveOffer(input);
  if ("error" in offer) return NextResponse.json({ error: offer.error }, { status: offer.status });
  const { product, plan, promotion, pricing } = offer;
  const settings = await Settings.findOne({ key: "main" }).lean();

  const now = new Date();
  const customer = {
    ...input.customer,
    documentNumber: input.customer.documentNumber.toUpperCase(),
    documentComplement: input.customer.documentType === "CI" ? (input.customer.documentComplement ?? "").toUpperCase() : "",
    documentIssuedIn: input.customer.documentType === "CI" ? input.customer.documentIssuedIn ?? "" : "",
  };
  const signerDocument = {
    type: input.signerDocument.type,
    number: input.signerDocument.number.toUpperCase(),
    complement: input.signerDocument.type === "CI" ? (input.signerDocument.complement ?? "").toUpperCase() : "",
    issuedIn: input.signerDocument.type === "CI" ? input.signerDocument.issuedIn ?? "" : "",
  };
  const customerDocument = formatDocument({ type: customer.documentType, number: customer.documentNumber, complement: customer.documentComplement, issuedIn: customer.documentIssuedIn });
  const includedBranches = plan.includedBranches ?? 1;
  const extraBranches = input.extraBranches ?? 0;

  const contractClauses = buildContractClauses({
    provider: { businessName: settings?.businessName ?? "CHAVIX", contactPhone: settings?.contactPhone ?? "", contactEmail: settings?.contactEmail ?? "" },
    customer: { name: customer.name, document: customerDocument, businessName: customer.businessName, address: customer.address, city: customer.city, phone: customer.phone, email: customer.email },
    signer: { name: input.signerName, document: formatDocument(signerDocument) },
    product: { name: product.name, features: product.features, includes: product.includes ?? "" },
    plan: {
      name: plan.name,
      mode: plan.mode,
      billing: plan.billing,
      price: plan.price,
      includedBranches,
      extraBranchPrice: plan.extraBranchPrice ?? 0,
      warrantyMonths: plan.warrantyMonths ?? 0,
      maintenanceAnnual: plan.maintenanceAnnual ?? 0,
    },
    siatOption: input.siatOption,
    duration: input.duration,
    extraBranches,
    pricing,
    promotion: promotion && pricing.discount > 0 ? { description: promotion.description || promotion.name, validUntil: formatPromotionEnd(new Date(promotion.endsAt)) } : null,
    extraTerms: settings?.contractTerms ?? "",
  });

  const code = `CHX-${now.getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  let identityPhotos;
  try {
    identityPhotos = {
      front: await storePrivateFile(front.bytes, front.mime, "carnets", `id-front-${code.toLowerCase()}`),
      back: await storePrivateFile(back.bytes, back.mime, "carnets", `id-back-${code.toLowerCase()}`),
    };
  } catch {
    return NextResponse.json({ error: "No se pudieron guardar las fotos del carnet. Intenta nuevamente." }, { status: 502 });
  }

  const signatureHash = createHash("sha256").update(input.signatureImage).digest("hex");
  const idPhotosHash = createHash("sha256").update(front.bytes).update(back.bytes).digest("hex");
  const documentHash = createHash("sha256").update(JSON.stringify({
    code,
    clauses: contractClauses,
    customer,
    selection: { product: product.name, mode: input.mode, plan: plan.name, duration: input.duration, extraBranches, siatOption: input.siatOption },
    pricing,
    acceptedAt: now.toISOString(),
    signerName: input.signerName,
    signerDocument,
    signatureHash,
    idPhotosHash,
  })).digest("hex");

  const contract = await Contract.create({
    code,
    ownerEmail: session.user.email.toLowerCase(),
    customer,
    selection: {
      productSlug: product.slug,
      productName: product.name,
      mode: input.mode,
      planName: plan.name,
      billing: plan.billing,
      duration: input.duration,
      extraBranches,
      includedBranches,
      siatOption: input.siatOption,
    },
    pricing,
    status: "pending_payment",
    paymentStatus: "unpaid",
    signedAt: now,
    signerName: input.signerName,
    signerDocument,
    signatureImage: input.signatureImage,
    signatureHash,
    identityPhotos,
    contractClauses,
    readConfirmedAt: now,
    documentHash,
    termsSnapshot: settings?.contractTerms ?? "",
    audit: [
      { event: "contract_read", by: session.user.email, at: now, note: "El cliente desplazó y leyó el contrato completo antes de aceptar." },
      { event: "contract_accepted", by: session.user.email, at: now, note: `Firma electrónica simple (trazo dibujado + ${signerDocument.type} ${signerDocument.number} + foto del carnet; SIAT ${input.siatOption === "with" ? "incluido" : "no incluido"}); no equivale a firma digital certificada.` },
    ],
  });
  const qr = await qrForAmount(pricing.total, settings);
  return NextResponse.json({
    id: String(contract._id),
    code: contract.code,
    status: contract.status,
    total: pricing.total,
    payment: { amount: pricing.total, qrImageUrl: qr.url, exactAmountQr: qr.exactAmount, qrExpired: qr.expired },
  }, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Inicia sesión para consultar tus contratos." }, { status: 401 });
  await connectDb();
  const filter = session.user.role === "admin" ? {} : { ownerEmail: session.user.email.toLowerCase() };
  const contracts = await Contract.find(filter, { signatureImage: 0, contractClauses: 0 }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(contracts.map((item) => ({
    id: String(item._id),
    code: item.code,
    productName: item.selection.productName,
    planName: item.selection.planName,
    mode: item.selection.mode,
    siatOption: item.selection.siatOption ?? "",
    total: item.pricing.total,
    status: item.status,
    paymentStatus: item.paymentStatus,
    createdAt: item.createdAt,
    customerName: item.customer.name,
    customerPhone: item.customer.phone,
    signerName: item.signerName,
    signerDocument: item.signerDocument?.number ? formatDocument(item.signerDocument) : "",
    hasSignature: Boolean(item.signatureHash),
    hasIdentityPhotos: Boolean(item.identityPhotos?.front?.publicId && item.identityPhotos?.back?.publicId),
    customerEmail: item.customer.email,
    customerDocument: formatDocument({ type: item.customer.documentType, number: item.customer.documentNumber, complement: item.customer.documentComplement, issuedIn: item.customer.documentIssuedIn }),
    businessName: item.customer.businessName ?? "",
    city: item.customer.city ?? "",
    duration: item.selection.duration,
    billing: item.selection.billing,
    extraBranches: item.selection.extraBranches ?? 0,
    receiptUploadedAt: item.receipt?.publicId ? item.receipt.uploadedAt : null,
    updatedAt: item.updatedAt,
  })));
}
