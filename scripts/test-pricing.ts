import assert from "node:assert/strict";
import { calculateQuote } from "../src/lib/pricing";
import { qrExpiryStatus, qrIsExpired } from "../src/lib/qr-expiry";

const firstMonthPromotion = {
  name: "Primer mes al 50%",
  billing: "monthly" as const,
  discountType: "percent" as const,
  amount: 50,
  firstPeriods: 1,
};

const monthlyThreeMonths = calculateQuote({
  price: 250,
  billing: "monthly",
  duration: 3,
  promotion: firstMonthPromotion,
});
assert.equal(monthlyThreeMonths.total, 625);
assert.deepEqual(monthlyThreeMonths.periods.map((period) => period.amount), [125, 250, 250]);
assert.equal(monthlyThreeMonths.discount, 125);

// Promo solo el primer mes: 2 meses = 125 + 250
const monthlyTwoMonths = calculateQuote({ price: 250, billing: "monthly", duration: 2, promotion: firstMonthPromotion });
assert.equal(monthlyTwoMonths.total, 375);
assert.deepEqual(monthlyTwoMonths.periods.map((period) => period.amount), [125, 250]);

const annual = calculateQuote({
  price: 2500,
  billing: "annual",
  duration: 12,
  promotion: firstMonthPromotion,
});
assert.equal(annual.total, 2500);
assert.equal(annual.discount, 0);

const oneTime = calculateQuote({ price: 2000, billing: "one_time", duration: 1 });
assert.equal(oneTime.total, 2000);

const fixedDiscountCode = calculateQuote({
  price: 250,
  billing: "monthly",
  duration: 3,
  promotion: {
    name: "Código cliente",
    billing: "monthly",
    discountType: "fixed",
    amount: 40,
    firstPeriods: 2,
  },
});
assert.deepEqual(fixedDiscountCode.periods.map((period) => period.amount), [210, 210, 250]);
assert.equal(fixedDiscountCode.discount, 80);

// Meses consecutivos con promo solo en el primero
for (let months = 1; months <= 12; months++) {
  const quote = calculateQuote({ price: 250, billing: "monthly", duration: months, promotion: firstMonthPromotion });
  assert.equal(quote.total, 125 + 250 * (months - 1));
}

// Multisucursal mensual + 2 sucursales adicionales (Bs 150/mes, sin descuento)
const multi = calculateQuote({ price: 450, billing: "monthly", duration: 2, promotion: firstMonthPromotion, extraBranches: 2, extraBranchPrice: 150 });
assert.deepEqual(multi.periods.map((period) => period.amount), [525, 750]);
assert.equal(multi.total, 1275);
assert.equal(multi.discount, 225);

// Anual con promo mensual: no se aplica
const annualMulti = calculateQuote({ price: 4500, billing: "annual", duration: 12, promotion: firstMonthPromotion, extraBranches: 1, extraBranchPrice: 1500 });
assert.equal(annualMulti.total, 6000);
assert.equal(annualMulti.promotionName, "");

const qrCheckDate = new Date("2026-11-13T16:00:00-04:00");
assert.equal(qrExpiryStatus("2026-11-20", qrCheckDate), "expiring");
assert.equal(qrExpiryStatus("2026-11-21", qrCheckDate), "active");
assert.equal(qrExpiryStatus("2026-11-12", qrCheckDate), "expired");
assert.equal(qrIsExpired("2026-11-12", qrCheckDate), true);
assert.equal(qrExpiryStatus("", qrCheckDate), "active");
assert.equal(qrExpiryStatus("2026-11-12", new Date("2026-11-13T02:00:00Z")), "expiring");

console.log("Pricing checks passed.");
