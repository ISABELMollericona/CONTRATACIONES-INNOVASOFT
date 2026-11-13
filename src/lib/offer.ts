import { connectDb } from "@/lib/db";
import { Product, Promotion } from "@/lib/models";
import { calculateQuote } from "@/lib/pricing";

export type OfferInput = {
  productSlug: string;
  planId: string;
  mode: string;
  duration: number;
  extraBranches?: number;
  promotionCode?: string;
};

export function formatPromotionEnd(date: Date) {
  return date.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" });
}

/** Promociones vigentes ahora (sin código), indexadas por slug y tipo de cobro. */
export async function activePromotions() {
  const now = new Date();
  return Promotion.find({ active: true, code: "", startsAt: { $lte: now }, endsAt: { $gte: now } }).lean();
}

/** Valida la selección contra la base de datos y calcula el precio en el servidor. */
export async function resolveOffer(input: OfferInput) {
  await connectDb();
  const product = await Product.findOne({ slug: input.productSlug, active: true }).lean();
  if (!product) return { error: "El sistema seleccionado no está disponible.", status: 404 } as const;
  if (!product.modes.includes(input.mode)) return { error: "La modalidad no está habilitada para este sistema.", status: 400 } as const;
  const plan = product.plans.find((item) => String(item._id) === input.planId && item.enabled && item.mode === input.mode);
  if (!plan || !plan.durationOptions.includes(input.duration)) {
    return { error: "El plan o duración no está disponible.", status: 400 } as const;
  }
  const extraBranches = input.extraBranches ?? 0;
  if (extraBranches < 0 || extraBranches > (plan.maxExtraBranches ?? 0)) {
    return { error: "La cantidad de sucursales adicionales no está disponible para este plan.", status: 400 } as const;
  }
  const now = new Date();
  const promotion = await Promotion.findOne({
    active: true,
    billing: plan.billing,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    $or: [{ productSlugs: product.slug }, { productSlugs: { $size: 0 } }],
    ...(input.promotionCode ? { code: input.promotionCode.toUpperCase() } : { code: "" }),
  }).lean();
  if (input.promotionCode && !promotion) {
    return { error: "El código promocional no es válido o no aplica a este plan.", status: 400 } as const;
  }
  const pricing = calculateQuote({
    price: plan.price,
    billing: plan.billing,
    duration: input.duration,
    maintenanceAnnual: plan.maintenanceAnnual,
    extraBranches,
    extraBranchPrice: plan.extraBranchPrice ?? 0,
    promotion: promotion ? {
      name: promotion.name,
      billing: promotion.billing,
      discountType: promotion.discountType,
      amount: promotion.amount,
      firstPeriods: promotion.firstPeriods,
    } : null,
  });
  return { product, plan, promotion, pricing } as const;
}
