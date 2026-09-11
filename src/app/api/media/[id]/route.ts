import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/db";
import { resolveSafeMediaPath } from "@/engine/media";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const media = await prisma.generatedMedia.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }
    const abs = resolveSafeMediaPath(media.storagePath);
    if (!abs) {
      return NextResponse.json({ error: "Media file unavailable" }, { status: 404 });
    }
    const buf = fs.readFileSync(abs);
    const mime = media.mimeType || "image/png";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": `inline; filename="${path.basename(abs)}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
