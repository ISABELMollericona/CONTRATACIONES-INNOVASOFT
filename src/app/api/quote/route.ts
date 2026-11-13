import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoQuote, isLocalPreview } from "@/lib/demo";
import { resolveOffer } from "@/lib/offer";

const quoteSchema = z.object({
  productSlug: z.string().min(1),
  planId: z.string().min(1),
  mode: z.string().min(1),
  duration: z.number().int().positive(),
  extraBranches: z.number().int().min(0).max(50).optional(),
  promotionCode: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const input = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Datos de cotización inválidos." }, { status: 400 });
  if (isLocalPreview) {
    const quote = getDemoQuote(input.data);
    if ("error" in quote) return NextResponse.json({ error: quote.error }, { status: 400 });
    return NextResponse.json(quote);
  }
  const offer = await resolveOffer(input.data);
  if ("error" in offer) return NextResponse.json({ error: offer.error }, { status: offer.status });
  return NextResponse.json({
    product: offer.product.name,
    mode: input.data.mode,
    plan: offer.plan.name,
    billing: offer.plan.billing,
    duration: input.data.duration,
    ...offer.pricing,
  });
}
