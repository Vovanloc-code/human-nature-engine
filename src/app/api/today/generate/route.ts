import { NextRequest, NextResponse } from "next/server";
import { runTodayPipeline } from "@/engine/editorial";
import {
  listCandidates,
  shapeTodayResult,
  type GenerateTodayResponse,
} from "@/engine/review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Depth presets adjust editor floor slightly for UI workflow. */
const DEPTH_FLOOR: Record<string, number> = {
  light: 65,
  balanced: 70,
  deep: 75,
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pageSlug?: string;
      pageSlugs?: string[];
      target?: number;
      depth?: string;
      minPool?: number;
      produceLimit?: number;
    };

    const pageSlug =
      body.pageSlug ??
      body.pageSlugs?.[0] ??
      "the-war-within";
    const depth = (body.depth ?? "balanced").toLowerCase();
    const floor = DEPTH_FLOOR[depth] ?? 70;
    const target = body.target ?? 5;

    const result = await runTodayPipeline({
      pageSlug,
      target,
      floor,
      minPool: body.minPool,
      produceLimit: body.produceLimit,
      persist: true,
      markReviewing: true,
    });

    const candidates = await listCandidates({
      status: "reviewing",
      pageSlug,
      limit: 50,
    });

    const payload: GenerateTodayResponse = shapeTodayResult(
      result,
      candidates
    );
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
