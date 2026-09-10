/**
 * Distribution / publishing orchestration (Phase 8).
 * Connectors live under src/providers/publishers; this module
 * writes publication_records, updates assets/queue, and feedback.
 */

import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";
import { recordFeedback } from "@/engine/feedback";
import {
  getPublisher,
  getPublisherStatuses,
  normalizePlatform,
  type PublishOptions,
  type PublishPlatform,
  type PublishResult,
  type PublisherStatus,
} from "@/providers/publishers";

export type { PublishOptions, PublishPlatform, PublishResult, PublisherStatus };
export { getPublisherStatuses, normalizePlatform };

export type RecordPublicationInput = {
  contentAssetId: string;
  pageId?: string | null;
  platform: string;
  externalId?: string;
  url?: string;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
  /** Also write a publish feedback_event (default true). */
  recordPublishFeedback?: boolean;
};

export async function recordPublication(input: RecordPublicationInput) {
  if (!input.contentAssetId?.trim()) {
    throw new Error("contentAssetId is required");
  }
  if (!input.platform?.trim()) throw new Error("platform is required");

  const asset = await prisma.contentAsset.findUnique({
    where: { id: input.contentAssetId },
    include: { concept: true },
  });
  if (!asset) throw new Error(`Content asset not found: ${input.contentAssetId}`);

  const publishedAt = input.publishedAt ?? new Date();

  const record = await prisma.publicationRecord.create({
    data: {
      contentAssetId: asset.id,
      pageId: input.pageId ?? asset.pageId,
      platform: input.platform.trim(),
      externalId: input.externalId,
      url: input.url,
      publishedAt,
      metadata: (input.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });

  await prisma.contentAsset.update({
    where: { id: asset.id },
    data: {
      status: "published",
      publishedAt,
    },
  });

  if (input.recordPublishFeedback !== false) {
    await recordFeedback({
      objectType: "content_asset",
      objectId: asset.id,
      action: "publish",
      notes: `publication:${input.platform}`,
      insightId: asset.concept?.insightId ?? undefined,
      pageId: (input.pageId ?? asset.pageId) ?? undefined,
    });
  }

  return record;
}

export type PublishInput = {
  contentAssetId?: string;
  queueId?: string;
  platform: string;
  options?: PublishOptions;
  /** Mark matching / all queue rows for this asset as published */
  updateQueue?: boolean;
};

export type PublishOutcome = {
  ok: true;
  platform: string;
  mode: PublishResult["mode"];
  contentAssetId: string;
  queueId?: string;
  publicationRecordId: string;
  externalId: string;
  url: string;
  publishedAt: string;
  raw: Record<string, unknown>;
};

export async function publishContent(
  input: PublishInput
): Promise<PublishOutcome> {
  const platform = normalizePlatform(input.platform);
  let contentAssetId = input.contentAssetId?.trim();
  let queueId = input.queueId?.trim();
  let pageId: string | null | undefined;

  if (queueId) {
    const queueItem = await prisma.contentQueue.findUnique({
      where: { id: queueId },
      include: {
        contentAsset: true,
        page: true,
      },
    });
    if (!queueItem) throw new Error(`Queue item not found: ${queueId}`);
    if (!queueItem.contentAssetId || !queueItem.contentAsset) {
      throw new Error(`Queue item ${queueId} has no content asset`);
    }
    if (
      contentAssetId &&
      contentAssetId !== queueItem.contentAssetId
    ) {
      throw new Error("queue-id asset mismatch with --asset");
    }
    contentAssetId = queueItem.contentAssetId;
    pageId = queueItem.pageId;
  }

  if (!contentAssetId) {
    throw new Error("Provide contentAssetId or queueId");
  }

  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      page: true,
      concept: true,
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${contentAssetId}`);

  pageId = pageId ?? asset.pageId;

  const publisher = getPublisher(platform);
  const result = await publisher.publish(
    {
      id: asset.id,
      title: asset.title,
      body: asset.body,
      format: asset.format,
      status: asset.status,
      metadata: asset.metadata,
      pageId: asset.pageId,
    },
    asset.page
      ? {
          id: asset.page.id,
          slug: asset.page.slug,
          name: asset.page.name,
        }
      : null,
    input.options
  );

  const publishedAt = new Date();
  const record = await recordPublication({
    contentAssetId: asset.id,
    pageId,
    platform,
    externalId: result.externalId,
    url: result.url,
    publishedAt,
    metadata: {
      mode: result.mode,
      publisher: publisher.name,
      raw: result.raw,
    },
  });

  if (input.updateQueue !== false) {
    if (queueId) {
      await prisma.contentQueue.update({
        where: { id: queueId },
        data: { status: "published" },
      });
    } else {
      await prisma.contentQueue.updateMany({
        where: {
          contentAssetId: asset.id,
          status: { in: ["queued", "approved"] },
        },
        data: { status: "published" },
      });
    }
  }

  return {
    ok: true,
    platform,
    mode: result.mode,
    contentAssetId: asset.id,
    queueId,
    publicationRecordId: record.id,
    externalId: result.externalId,
    url: result.url,
    publishedAt: publishedAt.toISOString(),
    raw: result.raw,
  };
}
