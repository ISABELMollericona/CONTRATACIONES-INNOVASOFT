const BOLIVIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function boliviaDate(now = new Date()) {
  const parts = BOLIVIA_DATE_FORMATTER.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function qrExpiryStatus(validUntil: string, now = new Date()) {
  if (!validUntil) return "active" as const;
  const daysRemaining = Math.round(
    (Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(`${boliviaDate(now)}T00:00:00Z`)) / 86400000,
  );
  if (daysRemaining < 0) return "expired" as const;
  if (daysRemaining <= 7) return "expiring" as const;
  return "active" as const;
}

export function qrIsExpired(validUntil: string | undefined, now = new Date()) {
  return Boolean(validUntil && qrExpiryStatus(validUntil, now) === "expired");
}
