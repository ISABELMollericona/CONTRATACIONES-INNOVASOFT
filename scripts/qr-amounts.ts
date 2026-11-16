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
import { qrFileKey } from "../src/lib/qr";
import { suggestQrAmounts } from "../src/lib/qr-amount-suggestions";

async function main() {
  await connectDb();
  const [products, promotions] = await Promise.all([Product.find({ active: true }).sort({ name: 1 }).lean(), activePromotions()]);
  const suggestions = suggestQrAmounts(products, promotions);
  for (const suggestion of suggestions) {
    const examples = suggestion.examples.slice(0, 3).join("; ");
    const more = suggestion.examples.length > 3 ? ` y ${suggestion.examples.length - 3} más` : "";
    console.log(`Bs ${suggestion.amount.toLocaleString("es-BO")} · ${examples}${more} → public/qr/${qrFileKey(suggestion.amount)}.png`);
  }
  console.log(`\nMontos distintos (${suggestions.length}): ${suggestions.map(({ amount }) => `Bs ${amount.toLocaleString("es-BO")}`).join(", ")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
