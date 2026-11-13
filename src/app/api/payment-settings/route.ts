import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { isLocalPreview } from "@/lib/demo";
import { Settings } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isLocalPreview) {
    return NextResponse.json({
      businessName: "CHAVIX",
      contactPhone: "72734148",
      contactEmail: "",
      bankName: "",
      beneficiary: "",
      accountNumber: "",
      qrImageUrl: "",
      paymentInstructions: "Vista previa: configura los datos de pago en el panel para publicarlos.",
      contractTerms: "Vista previa local. El flujo real de contratación requiere iniciar sesión con Google y configurar los servicios de producción.",
    });
  }
  await connectDb();
  const settings = await Settings.findOne({ key: "main" }).lean();
  return NextResponse.json({
    businessName: settings?.businessName ?? "CHAVIX",
    contactPhone: settings?.contactPhone ?? "",
    contactEmail: settings?.contactEmail ?? "",
    bankName: settings?.bankName ?? "",
    beneficiary: settings?.beneficiary ?? "",
    accountNumber: settings?.accountNumber ?? "",
    qrImageUrl: settings?.qrImageUrl ?? "",
    paymentInstructions: settings?.paymentInstructions ?? "",
    contractTerms: settings?.contractTerms ?? "",
  });
}
