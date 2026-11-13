import { BLACK_FRIDAY, CATALOG } from "@/lib/catalog-data";
import { calculateQuote } from "@/lib/pricing";

export const isLocalPreview = process.env.NODE_ENV === "development" && !process.env.MONGODB_URI;

const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");

function promoFor(productSlug: string, billing: string) {
  const now = new Date();
  const active = BLACK_FRIDAY.active && now >= BLACK_FRIDAY.startsAt && now <= BLACK_FRIDAY.endsAt;
  return active && BLACK_FRIDAY.billing === billing && BLACK_FRIDAY.productSlugs.includes(productSlug) ? BLACK_FRIDAY : null;
}

const products = CATALOG.filter((product) => product.active).map((product) => ({
  id: product.slug,
  slug: product.slug,
  name: product.name,
  description: product.description,
  features: product.features,
  modes: product.modes,
  accent: product.accent,
  includes: product.includes,
  plans: product.plans.map((plan) => ({
    ...plan,
    id: `${product.slug}-${slug(plan.mode)}-${plan.billing}`,
  })),
}));

export function getDemoCatalog() {
  return products.map((product) => ({
    ...product,
    plans: product.plans.map((plan) => {
      const promo = promoFor(product.slug, plan.billing);
      return {
        ...plan,
        promotion: promo ? {
          name: promo.name,
          description: promo.description,
          discountType: promo.discountType,
          amount: promo.amount,
          firstPeriods: promo.firstPeriods,
          validUntil: promo.endsAt.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }),
        } : null,
      };
    }),
  }));
}

export function getDemoQuote(input: {
  productSlug: string;
  planId: string;
  mode: string;
  duration: number;
  extraBranches?: number;
  promotionCode?: string;
}) {
  const product = products.find((item) => item.slug === input.productSlug);
  if (!product) return { error: "El sistema seleccionado no está disponible." };
  if (!product.modes.includes(input.mode)) return { error: "La modalidad no está habilitada para este sistema." };
  const plan = product.plans.find((item) => item.id === input.planId && item.mode === input.mode);
  if (!plan || !plan.durationOptions.includes(input.duration)) {
    return { error: "El plan o duración no está disponible." };
  }
  if ((input.extraBranches ?? 0) > plan.maxExtraBranches) return { error: "La cantidad de sucursales adicionales no está disponible." };
  if (input.promotionCode) return { error: "El código promocional no es válido en la vista previa local." };
  const quote = calculateQuote({
    price: plan.price,
    billing: plan.billing,
    duration: input.duration,
    maintenanceAnnual: plan.maintenanceAnnual,
    extraBranches: input.extraBranches ?? 0,
    extraBranchPrice: plan.extraBranchPrice,
    promotion: promoFor(product.slug, plan.billing),
  });
  return { product: product.name, mode: input.mode, plan: plan.name, billing: plan.billing, duration: input.duration, ...quote };
}
