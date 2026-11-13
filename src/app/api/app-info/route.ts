import { NextResponse } from "next/server";
import { devLoginEnabled } from "@/lib/auth";
import { isLocalPreview } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** Indica al cliente qué modo de acceso está disponible (sin exponer secretos). */
export async function GET() {
  return NextResponse.json({
    localPreview: isLocalPreview,
    googleLogin: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    devLogin: devLoginEnabled,
  });
}
