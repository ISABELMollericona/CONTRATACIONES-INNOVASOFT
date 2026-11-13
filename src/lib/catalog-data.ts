/**
 * Catálogo oficial según los flyers "Black Friday" de CHAVIX (12 al 30 de noviembre de 2026).
 * Se usa en el seed, en la vista previa local y en `npm run catalog:apply`.
 */
import type { BillingType } from "@/lib/models";

export type CatalogPlan = {
  name: string;
  mode: string;
  billing: BillingType;
  price: number;
  durationOptions: number[];
  maintenanceAnnual: number;
  enabled: boolean;
  description: string;
  badge: string;
  compareAtPrice: number;
  includedBranches: number;
  extraBranchPrice: number;
  maxExtraBranches: number;
  warrantyMonths: number;
};

export type CatalogProduct = {
  slug: string;
  name: string;
  description: string;
  features: string[];
  modes: string[];
  active: boolean;
  accent: string;
  includes: string;
  plans: CatalogPlan[];
};

/** Meses consecutivos 1, 2, 3 … 12 (sin saltos). */
export const MONTHS_1_TO_12 = Array.from({ length: 12 }, (_, index) => index + 1);

const plan = (data: Partial<CatalogPlan> & Pick<CatalogPlan, "name" | "mode" | "billing" | "price">): CatalogPlan => ({
  durationOptions: data.billing === "monthly" ? MONTHS_1_TO_12 : data.billing === "annual" ? [12] : [1],
  maintenanceAnnual: 0,
  enabled: true,
  description: "",
  badge: "",
  compareAtPrice: 0,
  includedBranches: 1,
  extraBranchPrice: 0,
  maxExtraBranches: 0,
  warrantyMonths: 0,
  ...data,
});

export const CATALOG: CatalogProduct[] = [
  {
    slug: "farmacia",
    name: "CHAVIX Farmacia",
    description: "Vende, factura y controla tu farmacia. Facturación SIAT, inventario por lotes, caja y reportes en un solo programa.",
    features: [
      "Facturación SIAT: factura en línea y sin internet; notas de crédito y anulaciones",
      "Lotes y vencimientos: sabe qué lote vence y véndelo primero",
      "Caja y arqueo: apertura, cierre y cuadre de cada cajero",
      "Reportes y contabilidad: ventas, utilidades, libros y flujo de caja",
      "Alertas de stock: avisos de productos por agotarse o por vencer",
      "Compras y proveedores: registra tus compras y lo que debes pagar",
      "Usuarios y permisos: cada empleado ve solo lo que le corresponde",
      "Sucursales y traspasos: mueve mercadería entre sucursales (plan Multisucursal)",
    ],
    modes: ["Unisucursal", "Multisucursal"],
    active: true,
    accent: "mint",
    includes: "facturas SIAT ilimitadas, instalación, capacitación y soporte remoto",
    plans: [
      plan({ name: "Mensual", mode: "Unisucursal", billing: "monthly", price: 250, description: "Sin pago inicial grande. Mantenimiento incluido." }),
      plan({ name: "Prepago anual", mode: "Unisucursal", billing: "annual", price: 2500, compareAtPrice: 3000, badge: "2 meses gratis", description: "Pagas 10 meses y usas 12. Mantenimiento incluido." }),
      plan({ name: "Pago único", mode: "Unisucursal", billing: "one_time", price: 3500, compareAtPrice: 4500, badge: "Ahorra Bs 1.000", maintenanceAnnual: 1200, warrantyMonths: 3, description: "El sistema es tuyo. 3 meses de garantía." }),
      plan({ name: "Mensual", mode: "Multisucursal", billing: "monthly", price: 450, includedBranches: 2, extraBranchPrice: 150, maxExtraBranches: 10, description: "Matriz + 1 sucursal. Mantenimiento incluido." }),
      plan({ name: "Prepago anual", mode: "Multisucursal", billing: "annual", price: 4500, compareAtPrice: 5400, badge: "2 meses gratis", includedBranches: 2, extraBranchPrice: 1500, maxExtraBranches: 10, description: "Matriz + 1 sucursal. Pagas 10 meses y usas 12." }),
      plan({ name: "Pago único", mode: "Multisucursal", billing: "one_time", price: 7000, compareAtPrice: 9000, badge: "Ahorra Bs 2.000", maintenanceAnnual: 2500, warrantyMonths: 3, includedBranches: 3, extraBranchPrice: 2000, maxExtraBranches: 10, description: "Hasta 3 sucursales. El sistema es tuyo." }),
    ],
  },
  {
    slug: "celular",
    name: "CHAVIX Celular",
    description: "Sistema de celular en modalidad unisucursal. Consulta con CHAVIX el alcance y los requisitos.",
    features: [],
    modes: ["Unisucursal"],
    active: true,
    accent: "blue",
    includes: "instalación, capacitación y soporte remoto",
    plans: [
      plan({ name: "Mensual", mode: "Unisucursal", billing: "monthly", price: 250, description: "Mantenimiento incluido." }),
      plan({ name: "Pago único", mode: "Unisucursal", billing: "one_time", price: 2000, description: "El sistema es tuyo." }),
    ],
  },
];

/** Promoción Black Friday: 50% solo en el primer mes de los planes mensuales. Hora de Bolivia (UTC-4). */
export const BLACK_FRIDAY = {
  name: "Primer mes al 50%",
  description: "Black Friday: 50% de descuento únicamente en el primer mes de los planes mensuales. Desde el 2.º mes se paga el precio normal.",
  productSlugs: ["farmacia", "celular"],
  billing: "monthly" as const,
  discountType: "percent" as const,
  amount: 50,
  firstPeriods: 1,
  code: "",
  startsAt: new Date("2026-11-12T00:00:00-04:00"),
  endsAt: new Date("2026-11-30T23:59:59-04:00"),
  active: true,
};
