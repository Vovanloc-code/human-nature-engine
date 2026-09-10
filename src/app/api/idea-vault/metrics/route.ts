import { NextResponse } from "next/server";
import { getIdeaVaultMetrics } from "@/engine/idea-vault";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await getIdeaVaultMetrics();
    return NextResponse.json(metrics);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
