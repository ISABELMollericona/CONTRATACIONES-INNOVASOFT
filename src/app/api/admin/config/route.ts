import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin";
import { connectDb } from "@/lib/db";
import { Product, Promotion, Settings } from "@/lib/models";

export const dynamic = "force-dynamic";

const configSchema = z.object({
  settings: z.object({
    businessName: z.string().trim().min(1).max(100),
    contactPhone: z.string().trim().max(40),
    contactEmail: z.string().trim().email().or(z.literal("")),
    bankName: z.string().trim().max(100),
    beneficiary: z.string().trim().max(120),
    accountNumber: z.string().trim().max(80),
    qrImageUrl: z.string().trim().url().or(z.literal("")),
    paymentInstructions: z.string().trim().max(500),
    contractTerms: z.string().trim().max(5000),
    qrByAmount: z.array(z.object({ amount: z.number().positive().max(10000000), imageUrl: z.string().trim().url() })).max(200).default([]),
  }),
  products: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(1).max(500),
    features: z.array(z.string().trim().min(1).max(120)).max(20),
    modes: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
    active: z.boolean(),
    includes: z.string().trim().max(300).default(""),
    plans: z.array(z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(80),
      mode: z.string().trim().min(1).max(60),
      billing: z.enum(["monthly", "annual", "one_time"]),
      price: z.number().min(0).max(10000000),
      durationOptions: z.array(z.number().int().positive().max(120)).min(1).max(36),
      maintenanceAnnual: z.number().min(0).max(10000000).optional(),
      enabled: z.boolean(),
      description: z.string().trim().max(200).default(""),
      badge: z.string().trim().max(40).default(""),
      compareAtPrice: z.number().min(0).max(10000000).default(0),
      includedBranches: z.number().int().min(1).max(100).default(1),
      extraBranchPrice: z.number().min(0).max(10000000).default(0),
      maxExtraBranches: z.number().int().min(0).max(50).default(0),
      warrantyMonths: z.number().int().min(0).max(60).default(0),
    })).max(20),
  })).max(100),
  promotion: z.object({
    active: z.boolean(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }),
});

export async function GET() {
  if (!await getAdminSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  await connectDb();
  const [products, settings, promotion] = await Promise.all([
    Product.find({}).sort({ name: 1 }).lean(),
    Settings.findOne({ key: "main" }).lean(),
    Promotion.findOne({ name: "Primer mes al 50%" }).lean(),
  ]);
  return NextResponse.json({
    products: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      description: product.description,
      features: product.features,
      modes: product.modes,
      active: product.active,
      includes: product.includes ?? "",
      plans: product.plans.map((plan) => ({
        id: String(plan._id),
        name: plan.name,
          mode: plan.mode,
          billing: plan.billing,
        price: plan.price,
        durationOptions: plan.durationOptions,
        maintenanceAnnual: plan.maintenanceAnnual ?? 0,
        enabled: plan.enabled,
        description: plan.description ?? "",
        badge: plan.badge ?? "",
        compareAtPrice: plan.compareAtPrice ?? 0,
        includedBranches: plan.includedBranches ?? 1,
        extraBranchPrice: plan.extraBranchPrice ?? 0,
        maxExtraBranches: plan.maxExtraBranches ?? 0,
        warrantyMonths: plan.warrantyMonths ?? 0,
      })),
    })),
    settings: settings ? {
      businessName: settings.businessName,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      bankName: settings.bankName,
      beneficiary: settings.beneficiary,
      accountNumber: settings.accountNumber,
      qrImageUrl: settings.qrImageUrl,
      paymentInstructions: settings.paymentInstructions,
      contractTerms: settings.contractTerms,
      qrByAmount: (settings.qrByAmount ?? []).map((item) => ({ amount: item.amount, imageUrl: item.imageUrl })),
    } : {},
    promotion: promotion ? {
      active: promotion.active,
      startsAt: new Date(promotion.startsAt).toISOString(),
      endsAt: new Date(promotion.endsAt).toISOString(),
    } : null,
  });
}

export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const parsed = configSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Los datos de configuración no son válidos." }, { status: 400 });
  if (new Date(parsed.data.promotion.endsAt) < new Date(parsed.data.promotion.startsAt)) {
    return NextResponse.json({ error: "La fecha de fin de la promoción debe ser posterior al inicio." }, { status: 400 });
  }
  await connectDb();
  const { settings, products, promotion } = parsed.data;
  await Promise.all([
    Settings.findOneAndUpdate({ key: "main" }, { $set: settings }, { upsert: true, new: true, setDefaultsOnInsert: true }),
    ...products.map((product) => Product.findOneAndUpdate(
      { slug: product.slug },
      {
        $set: {
          name: product.name,
          description: product.description,
          features: product.features,
          modes: product.modes,
          active: product.active,
          includes: product.includes,
          plans: product.plans.map((plan) => ({
            ...(plan.id ? { _id: plan.id } : {}),
            name: plan.name,
            mode: plan.mode,
            billing: plan.billing,
            price: plan.price,
            durationOptions: plan.durationOptions,
            maintenanceAnnual: plan.maintenanceAnnual,
            enabled: plan.enabled,
            description: plan.description,
            badge: plan.badge,
            compareAtPrice: plan.compareAtPrice,
            includedBranches: plan.includedBranches,
            extraBranchPrice: plan.extraBranchPrice,
            maxExtraBranches: plan.maxExtraBranches,
            warrantyMonths: plan.warrantyMonths,
          })),
        },
        $setOnInsert: { slug: product.slug },
      },
      { upsert: true, new: true, runValidators: true },
    )),
    Promotion.findOneAndUpdate(
      { name: "Primer mes al 50%" },
      { $set: { active: promotion.active, startsAt: new Date(promotion.startsAt), endsAt: new Date(promotion.endsAt) } },
      { new: true },
    ),
  ]);
  return NextResponse.json({ saved: true });
}
