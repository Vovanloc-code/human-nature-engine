/**
 * Distribution / publishing orchestration (Phase 8 + Phase 9 image).
 * Connectors live under src/providers/publishers; this module
 * writes publication_records, updates assets/queue, and feedback.
 * Idempotent: duplicate prevention per platform+mode+asset.
 */

import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";
import { recordFeedback } from "@/engine/feedback";
import { getLatestMediaForAsset } from "@/engine/media";
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
  /** Allow re-publish even if identical platform+mode exists (default false) */
  allowDuplicate?: boolean;
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
  publishMode?: string;
  assetType?: string;
  idempotentReplay?: boolean;
};

function publishModeKey(options?: PublishOptions): string {
  const m = (options?.publishMode ?? "facebook_text").toString();
  return m;
}

/**
 * Find an existing non-failed publication for same asset+platform+mode
 * to prevent duplicate posts (idempotency).
 */
export async function findExistingPublication(
  contentAssetId: string,
  platform: string,
  publishMode?: string
) {
  const records = await prisma.publicationRecord.findMany({
    where: { contentAssetId, platform },
    orderBy: { publishedAt: "desc" },
    take: 10,
  });
  if (!publishMode) return records[0] ?? null;
  return (
    records.find((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return meta.publishMode === publishMode || meta.mode === publishMode;
    }) ?? null
  );
}

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

  const modeKey = publishModeKey(input.options);
  if (!input.allowDuplicate) {
    const existing = await findExistingPublication(
      asset.id,
      platform,
      platform === "facebook" ? modeKey : undefined
    );
    // For facebook, key on publishMode; for others, any prior record on platform blocks
    if (existing && platform !== "facebook") {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        platform,
        mode: (meta.mode as PublishResult["mode"]) || "fixture",
        contentAssetId: asset.id,
        queueId,
        publicationRecordId: existing.id,
        externalId: existing.externalId ?? existing.id,
        url: existing.url ?? "",
        publishedAt: existing.publishedAt.toISOString(),
        raw: {
          idempotent: true,
          reusedPublicationRecordId: existing.id,
          note: "Duplicate publish prevented — returning existing record",
        },
        publishMode: typeof meta.publishMode === "string" ? meta.publishMode : undefined,
        assetType: typeof meta.assetType === "string" ? meta.assetType : undefined,
        idempotentReplay: true,
      };
    }
    if (existing && platform === "facebook") {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      if (meta.publishMode === modeKey || (!meta.publishMode && modeKey === "facebook_text")) {
        return {
          ok: true,
          platform,
          mode: (meta.mode as PublishResult["mode"]) || "dry-run",
          contentAssetId: asset.id,
          queueId,
          publicationRecordId: existing.id,
          externalId: existing.externalId ?? existing.id,
          url: existing.url ?? "",
          publishedAt: existing.publishedAt.toISOString(),
          raw: {
            idempotent: true,
            reusedPublicationRecordId: existing.id,
            note: "Duplicate facebook publish prevented",
            publishMode: modeKey,
          },
          publishMode: modeKey,
          assetType: typeof meta.assetType === "string" ? meta.assetType : undefined,
          idempotentReplay: true,
        };
      }
    }
  }

  // Attach latest generated media for image publishes
  const media = await getLatestMediaForAsset(asset.id);
  const options: PublishOptions = { ...(input.options ?? {}) };
  if (!options.imagePath && media?.storagePath) {
    options.imagePath = media.storagePath;
  }
  if (!options.publishMode && platform === "facebook" && media?.storagePath) {
    // Keep text as default unless caller asked for image — Phase 8 tests use text/dry-run
    // Only auto-upgrade when explicitly facebook_image or extras.requestImage
    if (options.extras?.preferImage === true) {
      options.publishMode = "facebook_image";
    }
  }

  const publisher = getPublisher(platform);
  const result = await publisher.publish(
    {
      id: asset.id,
      title: asset.title,
      body: asset.body,
      format: asset.format,
      status: asset.status,
      metadata: {
        ...((asset.metadata as object) ?? {}),
        imagePath: media?.storagePath,
        mimeType: media?.mimeType,
        generatedMediaId: media?.id,
      },
      pageId: asset.pageId,
      imagePath: media?.storagePath ?? options.imagePath,
      imageMimeType: media?.mimeType,
      generatedMediaId: media?.id,
    },
    asset.page
      ? {
          id: asset.page.id,
          slug: asset.page.slug,
          name: asset.page.name,
        }
      : null,
    options
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
      publishMode: result.publishMode ?? options.publishMode ?? null,
      assetType: result.assetType ?? null,
      generatedMediaId: media?.id ?? null,
      raw: result.raw,
    },
  });

  if (media && result.mode !== "dry-run") {
    await prisma.generatedMedia.update({
      where: { id: media.id },
      data: {
        published: true,
        publicationRecordId: record.id,
      },
    });
  } else if (media && options.publishMode === "facebook_image") {
    // Dry-run image still links for traceability without claiming live publish
    await prisma.generatedMedia.update({
      where: { id: media.id },
      data: {
        metadata: {
          ...((media.metadata as object) ?? {}),
          lastDryRunPublicationRecordId: record.id,
        } as Prisma.InputJsonValue,
      },
    });
  }

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
    publishMode: result.publishMode,
    assetType: result.assetType,
  };
}
