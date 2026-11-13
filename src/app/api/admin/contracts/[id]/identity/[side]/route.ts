import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { connectDb } from "@/lib/db";
import { Contract } from "@/lib/models";
import { privateFileResponse } from "@/lib/storage";

/** Foto del carnet (anverso o reverso). Solo administración. */
export async function GET(_request: Request, context: { params: Promise<{ id: string; side: string }> }) {
  if (!await getAdminSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { id, side } = await context.params;
  if (!isValidObjectId(id) || (side !== "front" && side !== "back")) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  await connectDb();
  const contract = await Contract.findById(id).lean();
  const photo = contract?.identityPhotos?.[side];
  if (!photo?.publicId) return NextResponse.json({ error: "No hay foto del carnet." }, { status: 404 });
  return privateFileResponse(photo);
}
