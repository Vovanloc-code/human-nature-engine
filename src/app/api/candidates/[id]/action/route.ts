import { NextRequest, NextResponse } from "next/server";
import {
  applyReviewAction,
  type ReviewAction,
} from "@/engine/review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED: ReviewAction[] = [
  "approve",
  "reject",
  "edit",
  "favorite",
  "regenerate",
  "regenerate_visual",
  "save_for_later",
  "copy",
];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      action?: string;
      reason?: string;
      notes?: string;
      edits?: {
        title?: string;
        body?: string;
        caption?: string;
        imageText?: string;
        hook?: string;
        status?: string;
      };
    };

    const action = body.action as ReviewAction | undefined;
    if (!action || !ALLOWED.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${ALLOWED.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await applyReviewAction({
      contentAssetId: id,
      action,
      reason: body.reason,
      notes: body.notes,
      edits: body.edits,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
