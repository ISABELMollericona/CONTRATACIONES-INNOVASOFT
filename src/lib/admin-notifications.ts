import { SMTPClient } from "emailjs";

export type AdminNotificationEvent = "new_contract" | "receipt_uploaded" | "payment_validated" | "payment_rejected";

export type AdminNotificationContract = {
  id: string;
  code: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  productName: string;
  planName: string;
  total: number;
  createdAt: Date | string;
};

const eventLabels: Record<AdminNotificationEvent, string> = {
  new_contract: "Nueva contratación",
  receipt_uploaded: "Comprobante de pago cargado",
  payment_validated: "Pago validado y contrato activado",
  payment_rejected: "Pago rechazado",
};

function adminRecipients() {
  return [...new Set((process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

export function getAdminNotificationStatus() {
  const missing: string[] = [];
  const host = process.env.SMTP_HOST?.trim();
  const username = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const recipients = adminRecipients();

  if (!host) missing.push("SMTP_HOST");
  if (!username) missing.push("SMTP_USER");
  if (!password) missing.push("SMTP_PASSWORD");
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT válido");
  if (recipients.length === 0) missing.push("ADMIN_EMAILS");

  return { configured: missing.length === 0, recipientCount: recipients.length, missing };
}

export async function notifyAdministrators(
  event: AdminNotificationEvent,
  contract: AdminNotificationContract,
) {
  try {
    const status = getAdminNotificationStatus();
    if (!status.configured) {
      throw new Error(`Notificaciones por correo sin configurar: ${status.missing.join(", ")}.`);
    }

    const host = process.env.SMTP_HOST?.trim();
    const username = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const port = Number(process.env.SMTP_PORT?.trim() || "587");
    if (!host || !username || !password) throw new Error("Faltan datos de conexión SMTP.");
    const recipients = adminRecipients();
    const client = new SMTPClient({
      user: username,
      password,
      host,
      port,
      ssl: port === 465,
      tls: port === 587,
      timeout: 20000,
    });
    const siteUrl = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
    const contractUrl = siteUrl ? `${siteUrl}/admin/contracts/${contract.id}` : "";
    const amount = `Bs ${contract.total.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
    const createdAt = new Date(contract.createdAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" });
    const lines = [
      eventLabels[event],
      `Código: ${contract.code}`,
      `Cliente: ${contract.customerName}`,
      `Correo: ${contract.customerEmail}`,
      `Teléfono: ${contract.customerPhone}`,
      `Producto: ${contract.productName} · ${contract.planName}`,
      `Total: ${amount}`,
      `Fecha: ${createdAt}`,
      contractUrl ? `Ver contratación: ${contractUrl}` : "",
    ].filter(Boolean);

    try {
      await client.sendAsync({
        from: process.env.SMTP_FROM?.trim() || username,
        to: recipients,
        subject: `${eventLabels[event]} · ${contract.code}`,
        text: lines.join("\n"),
      });
    } finally {
      client.smtp.close();
    }
    return { sent: true };
  } catch (error) {
    console.error(`No se pudo enviar la alerta de correo "${event}" para ${contract.code}.`, error);
    return { sent: false };
  }
}
