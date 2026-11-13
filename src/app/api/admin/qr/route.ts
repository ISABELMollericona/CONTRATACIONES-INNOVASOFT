import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { detectMime } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_QR_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!await getAdminSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo QR." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_QR_BYTES) {
    return NextResponse.json({ error: "Sube una imagen QR de hasta 5 MB." }, { status: 400 });
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return NextResponse.json({ error: "El QR debe ser una imagen JPG o PNG." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(bytes);
  if (mime !== file.type || (mime !== "image/jpeg" && mime !== "image/png")) {
    return NextResponse.json({ error: "El contenido del archivo no coincide con su formato de imagen." }, { status: 400 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (cloudName && apiKey && apiSecret) {
    try {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      const uploaded = await cloudinary.uploader.upload(
        `data:${mime};base64,${bytes.toString("base64")}`,
        { folder: "chavix/qr", public_id: randomUUID(), resource_type: "image", overwrite: false },
      );
      return NextResponse.json({ imageUrl: uploaded.secure_url });
    } catch (error) {
      console.error("No se pudo subir el QR a Cloudinary:", error);
      return NextResponse.json({ error: "Cloudinary no pudo guardar el QR. Revisa la configuración e intenta nuevamente." }, { status: 502 });
    }
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Configura Cloudinary para subir QR de forma persistente en producción." }, { status: 503 });
  }
  const filename = `${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
  const folder = path.join(process.cwd(), "public", "qr");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, filename), bytes);
  return NextResponse.json({ imageUrl: `/qr/${filename}` });
}
