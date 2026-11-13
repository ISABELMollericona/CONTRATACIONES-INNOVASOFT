import mongoose, { Schema, Types, type Model } from "mongoose";

export type BillingType = "monthly" | "annual" | "one_time";
export type Plan = {
  name: string;
  mode: string;
  billing: BillingType;
  price: number;
  durationOptions: number[];
  maintenanceAnnual?: number;
  enabled: boolean;
  /** Texto corto bajo el nombre del plan, por ejemplo "Pagas 10 meses y usas 12". */
  description?: string;
  /** Etiqueta destacada, por ejemplo "2 meses gratis". */
  badge?: string;
  /** Precio de referencia tachado (0 = no se muestra). */
  compareAtPrice?: number;
  /** Sucursales incluidas en el precio (matriz + sucursales). */
  includedBranches?: number;
  /** Precio por sucursal adicional, por periodo de cobro. */
  extraBranchPrice?: number;
  /** Máximo de sucursales adicionales que se pueden contratar en línea (0 = no se ofrecen). */
  maxExtraBranches?: number;
  /** Meses de garantía (soporte y actualizaciones gratis) para pago único. */
  warrantyMonths?: number;
};
export type FileRef = { publicId: string; resourceType: string; format: string; uploadedAt?: Date };
type ProductDocument = {
  slug: string;
  name: string;
  description: string;
  features: string[];
  modes: string[];
  plans: (Plan & { _id: Types.ObjectId })[];
  active: boolean;
  accent: string;
  /** Lo que incluyen todos los planes, por ejemplo "facturas SIAT ilimitadas, instalación...". */
  includes: string;
};
type PromotionDocument = {
  name: string;
  description: string;
  productSlugs: string[];
  billing: BillingType;
  discountType: "percent" | "fixed";
  amount: number;
  firstPeriods: number;
  code: string;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
};
type UserDocument = {
  email: string;
  name: string;
  image: string;
  role: "customer" | "admin";
};
type ContractDocument = {
  createdAt: Date;
  updatedAt: Date;
  code: string;
  ownerEmail: string;
  customer: {
    name: string;
    documentType: string;
    documentNumber: string;
    documentComplement: string;
    documentIssuedIn: string;
    phone: string;
    email: string;
    businessName: string;
    address: string;
    city: string;
  };
  selection: {
    productSlug: string;
    productName: string;
    mode: string;
    planName: string;
    billing: BillingType;
    duration: number;
    extraBranches: number;
    includedBranches: number;
  };
  pricing: {
    unitPrice: number;
    originalTotal: number;
    discount: number;
    total: number;
    currency: string;
    promotionName: string;
    periods: { label: string; amount: number }[];
    maintenanceAnnual: number;
    extraBranchesTotal: number;
  };
  status: "pending_payment" | "pending_review" | "active" | "rejected" | "cancelled";
  paymentStatus: "unpaid" | "pending_review" | "validated" | "rejected";
  receipt: FileRef;
  identityPhotos: { front: FileRef; back: FileRef };
  contractClauses: { title: string; paragraphs: string[] }[];
  readConfirmedAt?: Date;
  signedAt?: Date;
  signerName: string;
  signerDocument: { type: string; number: string; complement: string; issuedIn: string };
  signatureImage: string;
  signatureHash: string;
  documentHash: string;
  termsSnapshot: string;
  audit: { event: string; by: string; at: Date; note: string }[];
};
type SettingsDocument = {
  key: string;
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  bankName: string;
  beneficiary: string;
  accountNumber: string;
  qrImageUrl: string;
  qrImageValidUntil: string;
  paymentInstructions: string;
  contractTerms: string;
  qrByAmount: { amount: number; imageUrl: string; validUntil: string }[];
};

const PlanSchema = new Schema<Plan>(
  {
    name: { type: String, required: true, trim: true },
    mode: { type: String, required: true, trim: true },
    billing: { type: String, enum: ["monthly", "annual", "one_time"], required: true },
    price: { type: Number, required: true, min: 0 },
    durationOptions: { type: [Number], default: [1] },
    maintenanceAnnual: { type: Number, min: 0 },
    enabled: { type: Boolean, default: true },
    description: { type: String, default: "" },
    badge: { type: String, default: "" },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    includedBranches: { type: Number, default: 1, min: 1 },
    extraBranchPrice: { type: Number, default: 0, min: 0 },
    maxExtraBranches: { type: Number, default: 0, min: 0 },
    warrantyMonths: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const ProductSchema = new Schema<ProductDocument>(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    features: { type: [String], default: [] },
    modes: { type: [String], default: ["Unisucursal"] },
    plans: { type: [PlanSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    accent: { type: String, default: "mint" },
    includes: { type: String, default: "" },
  },
  { timestamps: true },
);

const PromotionSchema = new Schema<PromotionDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    productSlugs: { type: [String], default: [] },
    billing: { type: String, enum: ["monthly", "annual", "one_time"], required: true },
    discountType: { type: String, enum: ["percent", "fixed"], required: true },
    amount: { type: Number, required: true, min: 0 },
    firstPeriods: { type: Number, default: 1, min: 1 },
    code: { type: String, default: "" },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    active: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

const UserSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
  },
  { timestamps: true },
);

const ContractSchema = new Schema<ContractDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    ownerEmail: { type: String, required: true, index: true },
    customer: {
      name: { type: String, required: true },
      documentType: { type: String, required: true },
      documentNumber: { type: String, required: true },
      documentComplement: { type: String, default: "" },
      documentIssuedIn: { type: String, default: "" },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      businessName: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
    },
    selection: {
      productSlug: { type: String, required: true },
      productName: { type: String, required: true },
      mode: { type: String, required: true },
      planName: { type: String, required: true },
      billing: { type: String, required: true },
      duration: { type: Number, required: true },
      extraBranches: { type: Number, default: 0 },
      includedBranches: { type: Number, default: 1 },
    },
    pricing: {
      unitPrice: { type: Number, required: true },
      originalTotal: { type: Number, required: true },
      discount: { type: Number, required: true },
      total: { type: Number, required: true },
      currency: { type: String, default: "Bs" },
      promotionName: { type: String, default: "" },
      periods: [{ label: String, amount: Number }],
      maintenanceAnnual: { type: Number, default: 0 },
      extraBranchesTotal: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["pending_payment", "pending_review", "active", "rejected", "cancelled"],
      default: "pending_payment",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending_review", "validated", "rejected"],
      default: "unpaid",
    },
    receipt: {
      publicId: { type: String, default: "" },
      resourceType: { type: String, default: "" },
      format: { type: String, default: "" },
      uploadedAt: { type: Date },
    },
    identityPhotos: {
      front: { publicId: { type: String, default: "" }, resourceType: { type: String, default: "" }, format: { type: String, default: "" }, uploadedAt: { type: Date } },
      back: { publicId: { type: String, default: "" }, resourceType: { type: String, default: "" }, format: { type: String, default: "" }, uploadedAt: { type: Date } },
    },
    contractClauses: [{ _id: false, title: String, paragraphs: [String] }],
    readConfirmedAt: { type: Date },
    signedAt: { type: Date },
    signerName: { type: String, default: "" },
    signerDocument: {
      type: { type: String, default: "" },
      number: { type: String, default: "" },
      complement: { type: String, default: "" },
      issuedIn: { type: String, default: "" },
    },
    signatureImage: { type: String, default: "" },
    signatureHash: { type: String, default: "" },
    documentHash: { type: String, default: "" },
    termsSnapshot: { type: String, default: "" },
    audit: [{ event: String, by: String, at: Date, note: String }],
  },
  { timestamps: true },
);

const SettingsSchema = new Schema<SettingsDocument>(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    businessName: { type: String, default: "CHAVIX" },
    contactPhone: { type: String, default: "72734148" },
    contactEmail: { type: String, default: "" },
    bankName: { type: String, default: "" },
    beneficiary: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    qrImageUrl: { type: String, default: "" },
    qrImageValidUntil: { type: String, default: "" },
    paymentInstructions: { type: String, default: "" },
    contractTerms: { type: String, default: "El comprobante será revisado por CHAVIX. La contratación se activa después de validar el pago y completar la aceptación del contrato." },
    qrByAmount: { type: [{ _id: false, amount: Number, imageUrl: String, validUntil: { type: String, default: "" } }], default: [] },
  },
  { timestamps: true },
);

export const Product: Model<ProductDocument> = (mongoose.models.Product as Model<ProductDocument> | undefined)
  ?? mongoose.model<ProductDocument>("Product", ProductSchema);
export const Promotion: Model<PromotionDocument> = (mongoose.models.Promotion as Model<PromotionDocument> | undefined)
  ?? mongoose.model<PromotionDocument>("Promotion", PromotionSchema);
export const User: Model<UserDocument> = (mongoose.models.User as Model<UserDocument> | undefined)
  ?? mongoose.model<UserDocument>("User", UserSchema);
export const Contract: Model<ContractDocument> = (mongoose.models.Contract as Model<ContractDocument> | undefined)
  ?? mongoose.model<ContractDocument>("Contract", ContractSchema);
export const Settings: Model<SettingsDocument> = (mongoose.models.Settings as Model<SettingsDocument> | undefined)
  ?? mongoose.model<SettingsDocument>("Settings", SettingsSchema);
