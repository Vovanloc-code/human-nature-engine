import { NextResponse } from "next/server";
import { listPages } from "@/engine/review";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pages = await listPages();
    return NextResponse.json({ pages });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
