import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { connectDb } from "@/lib/db";
import { Contract } from "@/lib/models";
import { privateFileResponse } from "@/lib/storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdminSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "No se encontró el contrato." }, { status: 404 });
  await connectDb();
  const contract = await Contract.findById(id).lean();
  if (!contract?.receipt?.publicId || !contract.receipt.format) {
    return NextResponse.json({ error: "No hay un comprobante disponible." }, { status: 404 });
  }
  // ?inline=1 lo muestra dentro del panel; sin el parámetro se descarga.
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return privateFileResponse(contract.receipt, !inline);
}
