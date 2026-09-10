import { NextRequest, NextResponse } from "next/server";
import {
  getPublisherStatuses,
  publishContent,
} from "@/engine/publishing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      publishers: getPublisherStatuses(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      assetId?: string;
      contentAssetId?: string;
      queueId?: string;
      platform?: string;
      dryRun?: boolean;
      caption?: string;
    };

    const contentAssetId = body.contentAssetId ?? body.assetId;
    const platform = body.platform ?? "fixture";

    if (!contentAssetId && !body.queueId) {
      return NextResponse.json(
        { error: "Provide assetId/contentAssetId or queueId" },
        { status: 400 }
      );
    }

    const result = await publishContent({
      contentAssetId,
      queueId: body.queueId,
      platform,
      options: {
        dryRun: body.dryRun,
        caption: body.caption,
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Never echo env / tokens
    const safe = message.replace(
      /(token|password|secret|key)=[^\s&]+/gi,
      "$1=[redacted]"
    );
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
