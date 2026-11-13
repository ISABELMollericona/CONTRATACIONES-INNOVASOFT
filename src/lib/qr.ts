import { access } from "node:fs/promises";
import path from "node:path";
import { qrIsExpired } from "@/lib/qr-expiry";

/** Nombre de archivo para un monto: 375 → "375", 562.5 → "562_50". */
export function qrFileKey(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", "_");
}

/**
 * Busca el QR de pago para un monto exacto:
 * 1) URL configurada en administración para ese monto,
 * 2) imagen `public/qr/<monto>.png|jpg|jpeg|webp` incluida en el proyecto,
 * 3) QR general (sin monto) de la configuración.
 */
export async function qrForAmount(amount: number, settings?: {
  qrImageUrl?: string;
  qrImageValidUntil?: string;
  qrByAmount?: { amount: number; imageUrl: string; validUntil?: string }[];
} | null) {
  const configured = settings?.qrByAmount?.find((item) => Math.abs(item.amount - amount) < 0.005 && item.imageUrl);
  if (configured) {
    if (qrIsExpired(configured.validUntil)) return { url: "", exactAmount: false, expired: true };
    return { url: configured.imageUrl, exactAmount: true, expired: false };
  }
  const key = qrFileKey(amount);
  for (const extension of ["png", "jpg", "jpeg", "webp"]) {
    const file = path.join(process.cwd(), "public", "qr", `${key}.${extension}`);
    const exists = await access(file).then(() => true, () => false);
    if (exists) return { url: `/qr/${key}.${extension}`, exactAmount: true, expired: false };
  }
  if (qrIsExpired(settings?.qrImageValidUntil)) return { url: "", exactAmount: false, expired: true };
  return { url: settings?.qrImageUrl ?? "", exactAmount: false, expired: false };
}
