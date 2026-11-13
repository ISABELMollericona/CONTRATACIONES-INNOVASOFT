/**
 * Almacenamiento privado de archivos (comprobantes y fotos de carnet).
 * - Producción: Cloudinary con entrega autenticada.
 * - Desarrollo sin Cloudinary: carpeta local `.local-uploads/` (ignorada por git).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

export type StoredFile = { publicId: string; resourceType: string; format: string; uploadedAt: Date };
export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

export function detectMime(bytes: Buffer): AllowedMime | null {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  return null;
}

const extension = (mime: AllowedMime) => (mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg");
const localFolder = () => path.join(process.cwd(), ".local-uploads");

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export function storageAvailable() {
  return Boolean(cloudinaryConfig()) || process.env.NODE_ENV !== "production";
}

/** Guarda el archivo de forma privada. Lanza un error si no hay almacenamiento disponible. */
export async function storePrivateFile(bytes: Buffer, mime: AllowedMime, folder: string, baseName: string): Promise<StoredFile> {
  const id = `${baseName}-${randomBytes(5).toString("hex")}`;
  const config = cloudinaryConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") throw new Error("STORAGE_NOT_CONFIGURED");
    await mkdir(localFolder(), { recursive: true });
    await writeFile(path.join(localFolder(), `${id}.${extension(mime)}`), bytes);
    return { publicId: id, resourceType: "local", format: extension(mime), uploadedAt: new Date() };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = { folder: `chavix/${folder}`, public_id: id, timestamp, type: "authenticated" };
  const signatureBase = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  const signature = createHash("sha1").update(`${signatureBase}${config.apiSecret}`).digest("hex");
  const body = new FormData();
  body.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), `${id}.${extension(mime)}`);
  body.set("api_key", config.apiKey);
  for (const [key, value] of Object.entries(params)) body.set(key, value);
  body.set("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, { method: "POST", body });
  if (!response.ok) {
    console.error("Upload failed:", response.status, await response.text());
    throw new Error("UPLOAD_FAILED");
  }
  const uploaded = await response.json() as { public_id: string; resource_type: string; format: string };
  return { publicId: uploaded.public_id, resourceType: uploaded.resource_type, format: uploaded.format, uploadedAt: new Date() };
}

/** Devuelve el archivo privado (local) o redirige a un enlace temporal firmado (Cloudinary). */
export async function privateFileResponse(file: { publicId: string; resourceType: string; format: string }, download = false) {
  if (file.resourceType === "local") {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
    const bytes = await readFile(path.join(localFolder(), path.basename(`${file.publicId}.${file.format}`))).catch(() => null);
    if (!bytes) return NextResponse.json({ error: "No se encontró el archivo local." }, { status: 404 });
    const type = file.format === "pdf" ? "application/pdf" : file.format === "png" ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, no-store" } });
  }
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Cloudinary no está configurado." }, { status: 503 });
  cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
  const url = cloudinary.utils.private_download_url(file.publicId, file.format, {
    resource_type: file.resourceType as "image" | "raw" | "video",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 600,
    attachment: download,
  });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}

/** Convierte un data URL de imagen (JPG/PNG) en bytes validados. */
export function imageFromDataUrl(dataUrl: string, maxBytes: number) {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 100 || bytes.length > maxBytes) return null;
  const mime = detectMime(bytes);
  return mime === "image/jpeg" || mime === "image/png" ? { bytes, mime } : null;
}
