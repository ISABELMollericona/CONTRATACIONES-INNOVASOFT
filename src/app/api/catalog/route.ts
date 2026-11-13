import { NextResponse } from "next/server";
import { getDemoCatalog, isLocalPreview } from "@/lib/demo";
import { Product } from "@/lib/models";
import { activePromotions, formatPromotionEnd } from "@/lib/offer";
import { connectDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isLocalPreview) return NextResponse.json(getDemoCatalog());
  await connectDb();
  const [products, promotions] = await Promise.all([
    Product.find({ active: true }).sort({ name: 1 }).lean(),
    activePromotions(),
  ]);
  return NextResponse.json(products.map((product) => ({
    id: String(product._id),
    slug: product.slug,
    name: product.name,
    description: product.description,
    features: product.features,
    modes: product.modes,
    accent: product.accent,
    includes: product.includes ?? "",
    plans: product.plans.filter((plan) => plan.enabled).map((plan) => {
      const promotion = promotions.find((item) => item.billing === plan.billing
        && (item.productSlugs.length === 0 || item.productSlugs.includes(product.slug)));
      return {
        id: String(plan._id),
        name: plan.name,
        mode: plan.mode,
        billing: plan.billing,
        price: plan.price,
        durationOptions: plan.durationOptions,
        maintenanceAnnual: plan.maintenanceAnnual ?? 0,
        description: plan.description ?? "",
        badge: plan.badge ?? "",
        compareAtPrice: plan.compareAtPrice ?? 0,
        includedBranches: plan.includedBranches ?? 1,
        extraBranchPrice: plan.extraBranchPrice ?? 0,
        maxExtraBranches: plan.maxExtraBranches ?? 0,
        warrantyMonths: plan.warrantyMonths ?? 0,
        promotion: promotion ? {
          name: promotion.name,
          description: promotion.description,
          discountType: promotion.discountType,
          amount: promotion.amount,
          firstPeriods: promotion.firstPeriods,
          validUntil: formatPromotionEnd(new Date(promotion.endsAt)),
        } : null,
      };
    }),
  })));
}
