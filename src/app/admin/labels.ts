export const paymentLabels: Record<string, string> = {
  unpaid: "Sin pago",
  pending_review: "Por revisar",
  validated: "Pago validado",
  rejected: "Pago rechazado",
};

export const statusLabels: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_review: "Comprobante por revisar",
  active: "Activo",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

export const billingLabels: Record<string, string> = {
  monthly: "Mensual",
  annual: "Anual",
  one_time: "Pago único",
};

export const auditLabels: Record<string, string> = {
  contract_read: "Leyó el contrato completo",
  contract_accepted: "Firmó y aceptó el contrato",
  receipt_uploaded: "Subió el comprobante de pago",
  payment_validated: "Pago validado",
  payment_rejected: "Pago rechazado",
  admin_note: "Nota interna",
};

export const money = (value: number) => `Bs ${value.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;

export const dateTime = (value?: string | null) => (value
  ? new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—");

/** Hace cuánto: "hace 5 min", "hace 3 h", "hace 2 días". */
export function timeAgo(value?: string | null, now = Date.now()) {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

/** Enlace de WhatsApp para un número boliviano (agrega 591 si falta). */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 8 ? `591${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Tono visual del estado: qué tan urgente es para administración. */
export function statusTone(paymentStatus: string, status: string) {
  if (paymentStatus === "pending_review") return "warn";
  if (status === "active") return "ok";
  if (paymentStatus === "rejected" || status === "cancelled") return "bad";
  return "idle";
}
