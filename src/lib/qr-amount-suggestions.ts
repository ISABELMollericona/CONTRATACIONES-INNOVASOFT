import type { BillingType, Plan } from "@/lib/models";
import { calculateQuote } from "@/lib/pricing";

type SuggestionProduct = {
  slug: string;
  name: string;
  active: boolean;
  plans: Pick<Plan, "name" | "mode" | "billing" | "price" | "durationOptions" | "enabled">[];
};

type SuggestionPromotion = {
  name: string;
  productSlugs: string[];
  billing: BillingType;
  discountType: "percent" | "fixed";
  amount: number;
  firstPeriods: number;
  startsAt: string | Date;
  endsAt: string | Date;
  active: boolean;
};

export type QrAmountSuggestion = {
  amount: number;
  examples: string[];
};

export function suggestQrAmounts(
  products: readonly SuggestionProduct[],
  promotions: readonly SuggestionPromotion[],
  now: Date = new Date(),
): QrAmountSuggestion[] {
  const suggestions = new Map<number, { amount: number; examples: Set<string> }>();
  const nowTime = now.getTime();

  for (const product of products) {
    if (!product.active) continue;

    for (const plan of product.plans) {
      if (!plan.enabled || !Number.isFinite(plan.price) || plan.price <= 0) continue;
      const promotion = promotions.find((item) => {
        const startsAt = new Date(item.startsAt).getTime();
        const endsAt = new Date(item.endsAt).getTime();
        return item.active
          && item.billing === plan.billing
          && startsAt <= nowTime
          && endsAt >= nowTime
          && (item.productSlugs.length === 0 || item.productSlugs.includes(product.slug));
      });

      for (const duration of new Set(plan.durationOptions.filter((value) => Number.isInteger(value) && value > 0))) {
        const quote = calculateQuote({
          price: plan.price,
          billing: plan.billing,
          duration,
          promotion: promotion ? {
            name: promotion.name,
            billing: promotion.billing,
            discountType: promotion.discountType,
            amount: promotion.amount,
            firstPeriods: promotion.firstPeriods,
          } : null,
        });
        if (!Number.isFinite(quote.total) || quote.total <= 0) continue;

        const amount = Math.round(quote.total * 100) / 100;
        const key = Math.round(amount * 100);
        const durationLabel = plan.billing === "monthly"
          ? `${duration} ${duration === 1 ? "mes" : "meses"}`
          : plan.billing === "annual" ? "anual" : "pago único";
        const example = `${product.name} · ${plan.mode} · ${plan.name} · ${durationLabel}${promotion ? ` · ${promotion.name}` : ""}`;
        const suggestion = suggestions.get(key) ?? { amount, examples: new Set<string>() };
        suggestion.examples.add(example);
        suggestions.set(key, suggestion);
      }
    }
  }

  return [...suggestions.values()]
    .map(({ amount, examples }) => ({ amount, examples: [...examples] }))
    .sort((left, right) => left.amount - right.amount);
}
