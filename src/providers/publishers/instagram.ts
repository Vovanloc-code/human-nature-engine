/**
 * Instagram Graph API publisher (Business / Creator account via Facebook Page).
 * Live only when INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID are set;
 * otherwise safe dry-run.
 */

import type {
  PublishableAsset,
  PublishOptions,
  PublishPageContext,
  PublishResult,
  PublisherAdapter,
} from "./types";
import { fixturePublisher } from "./fixture";

const GRAPH = "https://graph.facebook.com/v19.0";

export function instagramCredentialsPresent(): boolean {
  return Boolean(
    process.env.INSTAGRAM_ACCESS_TOKEN?.trim() &&
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()
  );
}

function captionFor(asset: PublishableAsset, options?: PublishOptions): string {
  if (options?.caption?.trim()) return options.caption.trim();
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.caption === "string" && meta.caption.trim()) {
    return meta.caption.trim();
  }
  return asset.title;
}

async function livePublish(
  asset: PublishableAsset,
  page: PublishPageContext,
  options?: PublishOptions
): Promise<PublishResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN!.trim();
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!.trim();
  const caption = captionFor(asset, options);
  const imageUrl =
    (typeof options?.extras?.imageUrl === "string" &&
      options.extras.imageUrl) ||
    (typeof (asset.metadata as Record<string, unknown> | null)?.imageUrl ===
      "string" &&
      ((asset.metadata as Record<string, unknown>).imageUrl as string)) ||
    process.env.INSTAGRAM_DEFAULT_IMAGE_URL?.trim() ||
    "https://via.placeholder.com/1080";

  // Create media container
  const createRes = await fetch(
    `${GRAPH}/${encodeURIComponent(igUserId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: token,
      }),
    }
  );
  const createRaw = (await createRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!createRes.ok || typeof createRaw.id !== "string") {
    const errMsg =
      typeof createRaw.error === "object" &&
      createRaw.error &&
      typeof (createRaw.error as { message?: string }).message === "string"
        ? (createRaw.error as { message: string }).message
        : `Instagram media create error HTTP ${createRes.status}`;
    throw new Error(errMsg);
  }

  const publishRes = await fetch(
    `${GRAPH}/${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: createRaw.id,
        access_token: token,
      }),
    }
  );
  const publishRaw = (await publishRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!publishRes.ok) {
    const errMsg =
      typeof publishRaw.error === "object" &&
      publishRaw.error &&
      typeof (publishRaw.error as { message?: string }).message === "string"
        ? (publishRaw.error as { message: string }).message
        : `Instagram publish error HTTP ${publishRes.status}`;
    throw new Error(errMsg);
  }

  const externalId =
    typeof publishRaw.id === "string"
      ? publishRaw.id
      : `ig_${asset.id}_${Date.now()}`;

  return {
    externalId,
    url: `https://instagram.com/p/${externalId}`,
    mode: "live",
    platform: "instagram",
    raw: {
      adapter: "instagram",
      containerId: createRaw.id,
      mediaId: publishRaw.id ?? null,
      pageSlug: page?.slug ?? null,
      live: true,
    },
  };
}

export const instagramPublisher: PublisherAdapter = {
  name: "instagram",
  platform: "instagram",
  isConfigured() {
    return instagramCredentialsPresent();
  },
  async publish(asset, page, options): Promise<PublishResult> {
    const forceDry = options?.dryRun === true;
    if (forceDry || !instagramCredentialsPresent()) {
      const base = await fixturePublisher.publish(asset, page, {
        ...options,
        dryRun: true,
      });
      return {
        ...base,
        platform: "instagram",
        mode: "dry-run",
        externalId: `ig_dry_${asset.id.slice(0, 8)}_${Date.now().toString(36)}`,
        url: `https://instagram.com/dry-run/${asset.id}`,
        raw: {
          ...base.raw,
          adapter: "instagram",
          reason: forceDry
            ? "dryRun option"
            : "missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID",
          configured: instagramCredentialsPresent(),
        },
      };
    }
    return livePublish(asset, page, options);
  },
};
