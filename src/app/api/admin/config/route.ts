import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminNotificationStatus } from "@/lib/admin-notifications";
import { getAdminSession } from "@/lib/admin";
import { connectDb } from "@/lib/db";
import { Product, Promotion, Settings } from "@/lib/models";

export const dynamic = "force-dynamic";

const qrExpirySchema = z.string().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "La fecha de vencimiento no es válida.");
const qrImageUrlSchema = z.string().trim().url().or(z.string().regex(/^\/qr\/[A-Za-z0-9._-]+$/));

const configSchema = z.object({
  settings: z.object({
    businessName: z.string().trim().min(1).max(100),
    contactPhone: z.string().trim().max(40),
    contactEmail: z.string().trim().email().or(z.literal("")),
    bankName: z.string().trim().max(100),
    beneficiary: z.string().trim().max(120),
    accountNumber: z.string().trim().max(80),
    qrImageUrl: qrImageUrlSchema.or(z.literal("")),
    qrImageValidUntil: qrExpirySchema,
    paymentInstructions: z.string().trim().max(500),
    contractTerms: z.string().trim().max(5000),
    qrByAmount: z.array(z.object({
      amount: z.number().positive().max(10000000),
      imageUrl: qrImageUrlSchema,
      validUntil: qrExpirySchema,
    })).max(200).default([]),
  }),
  products: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    originalSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
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
    productSlugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(100).optional(),
    billing: z.enum(["monthly", "annual", "one_time"]).optional(),
    discountType: z.enum(["percent", "fixed"]).optional(),
    amount: z.number().positive().max(10000000).optional(),
    firstPeriods: z.number().int().min(1).max(120).optional(),
  }),
  deletedProductSlugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(100).default([]),
  discountCodes: z.array(z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(""),
    productSlugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(100),
    billing: z.enum(["monthly", "annual", "one_time"]),
    discountType: z.enum(["percent", "fixed"]),
    amount: z.number().positive().max(10000000),
    firstPeriods: z.number().int().min(1).max(120),
    code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_-]+$/)),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    active: z.boolean(),
  })).max(100),
}).superRefine((config, context) => {
  const codes = config.discountCodes ?? [];
  const seenCodes = new Set<string>();
  const seenIds = new Set<string>();
  const seenProductSlugs = new Set<string>();
  const productSlugs = new Set(config.products.map((product) => product.slug));
  config.products.forEach((product, index) => {
    if (seenProductSlugs.has(product.slug)) {
      context.addIssue({ code: "custom", path: ["products", index, "slug"], message: "Cada sistema debe tener un identificador único." });
    }
    seenProductSlugs.add(product.slug);
  });
  config.deletedProductSlugs.forEach((slug, index) => {
    if (productSlugs.has(slug)) {
      context.addIssue({ code: "custom", path: ["deletedProductSlugs", index], message: "No se puede eliminar un sistema que sigue en el catálogo." });
    }
  });
  if (config.promotion.active && config.promotion.productSlugs?.some((slug) => !productSlugs.has(slug))) {
    context.addIssue({ code: "custom", path: ["promotion", "productSlugs"], message: "La promoción selecciona un sistema que no existe." });
  }
  if (config.promotion.discountType === "percent" && config.promotion.amount !== undefined && config.promotion.amount > 100) {
    context.addIssue({ code: "custom", path: ["promotion", "amount"], message: "El porcentaje de la promoción no puede ser mayor a 100." });
  }
  codes.forEach((code, index) => {
    if (code.discountType === "percent" && code.amount > 100) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "amount"], message: "El porcentaje no puede ser mayor a 100." });
    }
    if (new Date(code.endsAt) < new Date(code.startsAt)) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "endsAt"], message: "La fecha de fin debe ser posterior al inicio." });
    }
    if (seenCodes.has(code.code)) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "code"], message: "Cada código debe ser único." });
    }
    seenCodes.add(code.code);
    if (code.id && seenIds.has(code.id)) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "id"], message: "La promoción está duplicada." });
    }
    if (code.id) seenIds.add(code.id);
    if (code.productSlugs.some((slug) => !productSlugs.has(slug))) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "productSlugs"], message: "Selecciona productos existentes." });
    }
    if (new Set(code.productSlugs).size !== code.productSlugs.length) {
      context.addIssue({ code: "custom", path: ["discountCodes", index, "productSlugs"], message: "No repitas productos." });
    }
  });
});

export async function GET() {
  if (!await getAdminSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  await connectDb();
  const [products, settings, promotion, discountCodes] = await Promise.all([
    Product.find({}).sort({ name: 1 }).lean(),
    Settings.findOne({ key: "main" }).lean(),
    Promotion.findOne({ name: "Primer mes al 50%", code: "" }).lean(),
    Promotion.find({ code: { $exists: true, $ne: "" } }).sort({ name: 1 }).lean(),
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
      qrImageValidUntil: settings.qrImageValidUntil ?? "",
      paymentInstructions: settings.paymentInstructions,
      contractTerms: settings.contractTerms,
      qrByAmount: (settings.qrByAmount ?? []).map((item) => ({ amount: item.amount, imageUrl: item.imageUrl, validUntil: item.validUntil ?? "" })),
    } : {},
    promotion: promotion ? {
      name: promotion.name,
      active: promotion.active,
      startsAt: new Date(promotion.startsAt).toISOString(),
      endsAt: new Date(promotion.endsAt).toISOString(),
      productSlugs: promotion.productSlugs ?? [],
      billing: promotion.billing,
      discountType: promotion.discountType,
      amount: promotion.amount,
      firstPeriods: promotion.firstPeriods,
    } : null,
    discountCodes: discountCodes.map((item) => ({
      id: String(item._id),
      name: item.name,
      description: item.description,
      productSlugs: item.productSlugs,
      billing: item.billing,
      discountType: item.discountType,
      amount: item.amount,
      firstPeriods: item.firstPeriods,
      code: item.code,
      startsAt: new Date(item.startsAt).toISOString(),
      endsAt: new Date(item.endsAt).toISOString(),
      active: item.active,
    })),
    emailNotifications: getAdminNotificationStatus(),
  });
}

export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const parsed = configSchema.safeParse(await request.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return NextResponse.json({ error: `${issue?.message ?? "Los datos de configuración no son válidos."}${field}` }, { status: 400 });
  }
  if (new Date(parsed.data.promotion.endsAt) < new Date(parsed.data.promotion.startsAt)) {
    return NextResponse.json({ error: "La fecha de fin de la promoción debe ser posterior al inicio." }, { status: 400 });
  }
  await connectDb();
  const { settings, products, promotion, discountCodes, deletedProductSlugs } = parsed.data;
  if (new Set(deletedProductSlugs).size !== deletedProductSlugs.length) {
    return NextResponse.json({ error: "No repitas sistemas en la lista de eliminación." }, { status: 400 });
  }
  const existingCodes = await Promotion.find({ code: { $exists: true, $ne: "" } }).select("_id").lean();
  const existingIds = new Set(existingCodes.map((item) => String(item._id)));
  if (discountCodes?.some((item) => item.id && !existingIds.has(item.id))) {
    return NextResponse.json({ error: "No se pudo identificar uno de los códigos de descuento." }, { status: 400 });
  }
  const existingProducts = new Set((await Product.find({ slug: { $in: deletedProductSlugs } }).select("slug").lean()).map((item) => item.slug));
  if ([...new Set(deletedProductSlugs)].some((slug) => !existingProducts.has(slug))) {
    return NextResponse.json({ error: "No se pudo identificar uno de los sistemas que quieres eliminar." }, { status: 400 });
  }
  await Promise.all([
    Settings.findOneAndUpdate({ key: "main" }, { $set: settings }, { upsert: true, new: true, setDefaultsOnInsert: true }),
    ...products.map((product) => Product.findOneAndUpdate(
      { slug: product.originalSlug ?? product.slug },
      {
        $set: {
          ...(product.originalSlug && product.originalSlug !== product.slug ? { slug: product.slug } : {}),
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
        ...(product.originalSlug ? {} : { $setOnInsert: { slug: product.slug } }),
      },
      { upsert: true, new: true, runValidators: true },
    )),
    Promotion.findOneAndUpdate(
      { name: "Primer mes al 50%", code: "" },
      {
        $set: {
          active: promotion.active,
          startsAt: new Date(promotion.startsAt),
          endsAt: new Date(promotion.endsAt),
          ...(promotion.productSlugs ? { productSlugs: promotion.productSlugs } : {}),
          ...(promotion.billing ? { billing: promotion.billing } : {}),
          ...(promotion.discountType ? { discountType: promotion.discountType } : {}),
          ...(promotion.amount !== undefined ? { amount: promotion.amount } : {}),
          ...(promotion.firstPeriods !== undefined ? { firstPeriods: promotion.firstPeriods } : {}),
        },
      },
      { new: true, runValidators: true },
    ),
  ]);
  const codeValues = (item: (typeof discountCodes)[number]) => ({
      name: item.name,
      description: item.description,
      productSlugs: item.productSlugs,
      billing: item.billing,
      discountType: item.discountType,
      amount: item.amount,
      firstPeriods: item.firstPeriods,
      code: item.code,
      startsAt: new Date(item.startsAt),
      endsAt: new Date(item.endsAt),
      active: item.active,
  });
  await Promise.all(discountCodes.filter((item) => item.id).map((item) => Promotion.updateOne(
      { _id: item.id, code: { $exists: true, $ne: "" } },
      { $set: codeValues(item) },
      { runValidators: true },
  )));
  const createdCodes = discountCodes.filter((item) => !item.id);
  const inserted = createdCodes.length
    ? await Promotion.insertMany(createdCodes.map(codeValues))
    : [];
  const retainedIds = [
    ...discountCodes.filter((item) => item.id).map((item) => item.id),
    ...inserted.map((item) => String(item._id)),
  ];
  await Promotion.deleteMany({
    code: { $exists: true, $ne: "" },
    _id: { $nin: retainedIds },
  });
  if (deletedProductSlugs.length > 0) {
    await Product.deleteMany({ slug: { $in: deletedProductSlugs } });
  }
  return NextResponse.json({ saved: true });
}
