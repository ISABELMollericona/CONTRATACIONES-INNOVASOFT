/**
 * Lista todos los montos posibles a pagar (sin sucursales adicionales) para preparar un QR por monto.
 * Nombra cada imagen con el monto, por ejemplo `public/qr/375.png`.
 *
 *   npm run qr:amounts
 */
import mongoose from "mongoose";
import { connectDb } from "../src/lib/db";
import { Product } from "../src/lib/models";
import { activePromotions } from "../src/lib/offer";
import { calculateQuote } from "../src/lib/pricing";
import { qrFileKey } from "../src/lib/qr";

async function main() {
  await connectDb();
  const [products, promotions] = await Promise.all([Product.find({ active: true }).sort({ name: 1 }).lean(), activePromotions()]);
  const amounts = new Map<number, string[]>();
  for (const product of products) {
    for (const plan of product.plans.filter((item) => item.enabled)) {
      const promotion = promotions.find((item) => item.billing === plan.billing && (item.productSlugs.length === 0 || item.productSlugs.includes(product.slug)));
      console.log(`\n${product.name} · ${plan.mode} · ${plan.name}${promotion ? ` (con "${promotion.name}")` : ""}`);
      for (const duration of plan.durationOptions) {
        const quote = calculateQuote({ price: plan.price, billing: plan.billing, duration, promotion: promotion ?? null });
        const label = plan.billing === "monthly" ? `${duration} mes${duration === 1 ? "" : "es"}` : plan.name;
        console.log(`  ${label.padEnd(14)} Bs ${quote.total.toLocaleString("es-BO")}   → public/qr/${qrFileKey(quote.total)}.png`);
        amounts.set(quote.total, [...(amounts.get(quote.total) ?? []), `${product.name} ${plan.mode} ${label}`]);
      }
    }
  }
  console.log(`\nMontos distintos (${amounts.size}): ${[...amounts.keys()].sort((a, b) => a - b).map((value) => `Bs ${value.toLocaleString("es-BO")}`).join(", ")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
