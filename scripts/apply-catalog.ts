/**
 * Aplica el catálogo y la promoción Black Friday de `src/lib/catalog-data.ts` a la base de datos,
 * SOBRESCRIBIENDO precios, planes y textos. Conserva los IDs de los planes que ya existen
 * (por modalidad + tipo de cobro). Los contratos ya creados no cambian.
 *
 *   npm run catalog:apply
 */
import mongoose from "mongoose";
import { BLACK_FRIDAY, CATALOG } from "../src/lib/catalog-data";
import { connectDb } from "../src/lib/db";
import { Product, Promotion, Settings } from "../src/lib/models";

async function apply() {
  await connectDb();
  for (const item of CATALOG) {
    const existing = await Product.findOne({ slug: item.slug }).lean();
    const plans = item.plans.map((plan) => {
      const match = existing?.plans.find((old) => old.mode === plan.mode && old.billing === plan.billing);
      return match ? { ...plan, _id: match._id } : plan;
    });
    await Product.findOneAndUpdate(
      { slug: item.slug },
      { $set: { ...item, plans } },
      { upsert: true, new: true, runValidators: true },
    );
    console.log(`✔ ${item.name}: ${plans.length} planes`);
  }
  await Promotion.findOneAndUpdate({ name: BLACK_FRIDAY.name }, { $set: BLACK_FRIDAY }, { upsert: true, new: true });
  console.log(`✔ Promoción "${BLACK_FRIDAY.name}" del ${BLACK_FRIDAY.startsAt.toISOString()} al ${BLACK_FRIDAY.endsAt.toISOString()}`);
  await Settings.findOneAndUpdate({ key: "main" }, { $setOnInsert: { key: "main" } }, { upsert: true });
}

apply()
  .catch((error: unknown) => {
    console.error("No se pudo aplicar el catálogo:", error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
