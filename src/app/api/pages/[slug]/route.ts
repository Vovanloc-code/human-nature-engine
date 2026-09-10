import { NextRequest, NextResponse } from "next/server";
import { getPageBySlug, updatePageDna } from "@/engine/review";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const page = await getPageBySlug(slug);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const body = await req.json();
    const dna = await updatePageDna(slug, {
      topics: body.topics,
      voice: body.voice,
      visualMix: body.visualMix ?? body.visual_mix,
      formatMix: body.formatMix ?? body.format_mix,
      weights: body.weights,
    });
    const page = await getPageBySlug(slug);
    return NextResponse.json({ page, dna });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
