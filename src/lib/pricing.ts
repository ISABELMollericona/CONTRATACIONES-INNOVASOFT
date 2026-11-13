import type { BillingType } from "@/lib/models";

type QuoteInput = {
  price: number;
  billing: BillingType;
  duration: number;
  promotion?: {
    name: string;
    billing: BillingType;
    discountType: "percent" | "fixed";
    amount: number;
    firstPeriods: number;
  } | null;
  maintenanceAnnual?: number;
  /** Sucursales adicionales a las incluidas en el plan. */
  extraBranches?: number;
  /** Precio de cada sucursal adicional por periodo (mes, año o pago único). La promoción no se aplica a este monto. */
  extraBranchPrice?: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function calculateQuote(input: QuoteInput) {
  const { price, billing, duration, promotion } = input;
  const extraBranches = Math.max(0, Math.floor(input.extraBranches ?? 0));
  const extraPerPeriod = round(extraBranches * (input.extraBranchPrice ?? 0));
  const periods = billing === "monthly" ? duration : 1;
  const charges = Array.from({ length: periods }, (_, index) => {
    let amount = price;
    if (promotion && promotion.billing === billing && index < promotion.firstPeriods) {
      const discount = promotion.discountType === "percent"
        ? amount * (promotion.amount / 100)
        : promotion.amount;
      amount = Math.max(0, amount - discount);
    }
    return {
      label: billing === "monthly" ? `Mes ${index + 1}` : billing === "annual" ? "Anualidad" : "Pago único",
      amount: round(amount + extraPerPeriod),
    };
  });
  const originalTotal = round((price + extraPerPeriod) * periods);
  const total = round(charges.reduce((sum, item) => sum + item.amount, 0));
  const applied = Boolean(promotion && promotion.billing === billing && total < originalTotal);
  return {
    unitPrice: price,
    originalTotal,
    discount: round(originalTotal - total),
    total,
    periods: charges,
    maintenanceAnnual: input.maintenanceAnnual ?? 0,
    promotionName: applied ? promotion?.name ?? "" : "",
    extraBranches,
    extraBranchesTotal: round(extraPerPeriod * periods),
  };
}

export type QuoteResult = ReturnType<typeof calculateQuote>;
