import PDFDocument from "pdfkit";
import { isValidObjectId } from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { formatDocument } from "@/lib/identity";
import { Contract } from "@/lib/models";

export const runtime = "nodejs";

const ACCENT = "#0f9d8a";
const INK = "#111111";
const TEXT = "#2b2b2b";
const MUTED = "#666666";
const boliviaTime = (date?: Date) => (date ? new Date(date).toLocaleString("es-BO", { timeZone: "America/La_Paz" }) : "—");
const money = (value: number) => `Bs ${value.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Inicia sesión para descargar el contrato." }, { status: 401 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const filter = session.user.role === "admin" ? { _id: id } : { _id: id, ownerEmail: session.user.email.toLowerCase() };
  const contract = await Contract.findOne(filter).lean();
  if (!contract) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });

  const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 60, right: 60 }, bufferPages: true, info: { Title: `Contrato ${contract.code}`, Author: "CHAVIX" } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };
  const heading = (text: string) => {
    ensureSpace(60);
    doc.moveDown(0.8).font("Helvetica-Bold").fontSize(11.5).fillColor(INK).text(text, left, doc.y, { width });
    doc.moveDown(0.3).font("Helvetica").fontSize(10.5).fillColor(TEXT);
  };
  const paragraph = (text: string) => {
    const bullet = text.startsWith("• ");
    ensureSpace(30);
    const y = doc.y;
    if (bullet) doc.circle(left + 5, y + 6, 1.8).fill(TEXT);
    doc.font("Helvetica").fontSize(10.5).fillColor(TEXT)
      .text(bullet ? text.slice(2) : text, bullet ? left + 14 : left, y, { width: bullet ? width - 14 : width, align: bullet ? "left" : "justify", lineGap: 2.5 });
    doc.moveDown(0.35);
  };

  // ---- Encabezado ----
  doc.font("Helvetica-Bold").fillColor(ACCENT).fontSize(10).text("CHAVIX", left, doc.y, { characterSpacing: 1.5 });
  doc.moveDown(0.3).fillColor(INK).fontSize(18).text("CONTRATO DE LICENCIA DE USO Y SERVICIO DE SOFTWARE", { width });
  doc.moveDown(0.4).font("Helvetica").fontSize(10.5).fillColor(MUTED)
    .text(`N.º ${contract.code}   ·   Firmado el ${boliviaTime(contract.signedAt)} (hora de Bolivia)`);
  doc.moveDown(0.6);

  // ---- Resumen ----
  const summaryTop = doc.y;
  const rows: [string, string][] = [
    ["Sistema", `${contract.selection.productName} · ${contract.selection.mode}`],
    ["Plan", `${contract.selection.planName}${contract.selection.billing === "monthly" ? ` · ${contract.selection.duration} mes(es)` : ""}`],
    ...(contract.selection.siatOption ? [[
      "Facturación",
      contract.selection.siatOption === "with" ? "Con SIAT" : "Sin SIAT",
    ] as [string, string]] : []),
    ["Locales", `${(contract.selection.includedBranches ?? 1) + (contract.selection.extraBranches ?? 0)}${contract.selection.extraBranches ? ` (incluye ${contract.selection.extraBranches} adicional/es)` : ""}`],
    ["Total a pagar", money(contract.pricing.total)],
  ];
  doc.roundedRect(left, summaryTop, width, rows.length * 18 + 16, 6).fillAndStroke("#f3faf8", "#cfe9e3");
  rows.forEach(([label, value], index) => {
    const y = summaryTop + 9 + index * 18;
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, left + 12, y, { width: 110 });
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(value, left + 125, y, { width: width - 137 });
  });
  doc.x = left;
  doc.y = summaryTop + rows.length * 18 + 26;

  // ---- Cláusulas ----
  const clauses = contract.contractClauses?.length
    ? contract.contractClauses
    : [{ title: "CONDICIONES", paragraphs: [contract.termsSnapshot || "Sin condiciones registradas."] }];
  for (const clause of clauses) {
    heading(clause.title);
    for (const text of clause.paragraphs) paragraph(text);
  }

  // ---- Firma ----
  const customerDocument = formatDocument({ type: contract.customer.documentType, number: contract.customer.documentNumber, complement: contract.customer.documentComplement, issuedIn: contract.customer.documentIssuedIn });
  const signerDocument = contract.signerDocument?.number ? formatDocument(contract.signerDocument) : customerDocument;
  ensureSpace(230);
  doc.moveDown(1).font("Helvetica-Bold").fontSize(12).fillColor(INK).text("FIRMA DEL CLIENTE", left, doc.y);
  const top = doc.y + 8;
  doc.roundedRect(left, top, width, 132, 6).lineWidth(0.7).strokeColor("#bbbbbb").stroke();
  const box = { x: left + 16, y: top + 10, width: 210, height: 72 };
  if (contract.signatureImage?.startsWith("data:image/png;base64,")) {
    try {
      doc.image(Buffer.from(contract.signatureImage.split(",")[1] ?? "", "base64"), box.x, box.y, { fit: [box.width, box.height], align: "center", valign: "bottom" });
    } catch {
      doc.font("Helvetica").fontSize(9).fillColor("#999999").text("(firma no disponible)", box.x, box.y + 30, { width: box.width, align: "center" });
    }
  }
  const lineY = box.y + box.height + 4;
  doc.moveTo(box.x, lineY).lineTo(box.x + box.width, lineY).lineWidth(0.8).strokeColor("#333333").stroke();
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(contract.signerName || contract.customer.name, box.x, lineY + 6, { width: box.width, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(signerDocument, box.x, lineY + 21, { width: box.width, align: "center" });
  const infoX = left + 250;
  const infoWidth = width - 262;
  doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
    .text(`Firmante: ${contract.signerName}`, infoX, top + 14, { width: infoWidth })
    .text(`Documento: ${signerDocument}`, { width: infoWidth })
    .text(`Fecha y hora: ${boliviaTime(contract.signedAt)}`, { width: infoWidth })
    .text(`Cuenta: ${contract.ownerEmail}`, { width: infoWidth })
    .text(`Foto del carnet: ${contract.identityPhotos?.front?.publicId ? "anverso y reverso registrados" : "no registrada"}`, { width: infoWidth })
    .text(`Lectura completa confirmada: ${contract.readConfirmedAt ? boliviaTime(contract.readConfirmedAt) : "—"}`, { width: infoWidth });
  doc.x = left;
  doc.y = top + 142;
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text("Firma electrónica simple: firma dibujada por el firmante, vinculada a su documento de identidad, foto del carnet, fecha y huella del contenido. No equivale a una firma digital certificada por una entidad acreditada.", left, doc.y, { width })
    .moveDown(0.4)
    .text(`Huella de la firma (SHA-256): ${contract.signatureHash || "—"}`, { width })
    .text(`Integridad del contrato (SHA-256): ${contract.documentHash}`, { width });

  // ---- Pie de página con numeración ----
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(`Contrato ${contract.code} · Página ${index + 1} de ${range.count}`, left, doc.page.height - 38, { width, align: "center" });
    doc.page.margins.bottom = bottom;
  }
  doc.end();

  const pdf = await output;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${contract.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
