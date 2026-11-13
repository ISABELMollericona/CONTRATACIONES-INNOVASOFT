import mongoose from "mongoose";
import { BLACK_FRIDAY, CATALOG } from "../src/lib/catalog-data";
import { connectDb } from "../src/lib/db";
import { Product, Promotion, Settings } from "../src/lib/models";

/** Carga inicial idempotente: no reemplaza productos ni precios ya guardados. Para actualizarlos usa `npm run catalog:apply`. */
async function seed() {
  await connectDb();
  for (const product of CATALOG) {
    await Product.findOneAndUpdate(
      { slug: product.slug },
      { $setOnInsert: product },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  await Promotion.findOneAndUpdate(
    { name: BLACK_FRIDAY.name },
    { $setOnInsert: BLACK_FRIDAY },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Settings.findOneAndUpdate({ key: "main" }, { $setOnInsert: { key: "main" } }, { upsert: true });
  console.log("Seed completed. Existing catalog values were not overwritten.");
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
