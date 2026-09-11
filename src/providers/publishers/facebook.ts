/**
 * Facebook Page publisher via Graph API.
 * Modes: facebook_text (/feed) | facebook_image (/photos with caption).
 * Live only when FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_PAGE_ID are set;
 * otherwise safe dry-run (no throw, no secret leakage).
 */
import fs from "fs";
import path from "path";
import type {
  PublishableAsset,
  PublishOptions,
  PublishPageContext,
  PublishResult,
  PublisherAdapter,
  FacebookPublishMode,
} from "./types";
import { fixturePublisher } from "./fixture";

const GRAPH = "https://graph.facebook.com/v19.0";

export function facebookCredentialsPresent(): boolean {
  return Boolean(
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() &&
      process.env.FACEBOOK_PAGE_ID?.trim()
  );
}

function messageFor(asset: PublishableAsset, options?: PublishOptions): string {
  if (options?.caption?.trim()) return options.caption.trim();
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.caption === "string" && meta.caption.trim()) {
    return meta.caption.trim();
  }
  const parts = [asset.title];
  if (asset.body?.trim()) parts.push(asset.body.trim());
  return parts.join("\n\n");
}

export function resolveFacebookPublishMode(
  options?: PublishOptions,
  asset?: PublishableAsset
): FacebookPublishMode {
  const raw = (options?.publishMode ?? "").toString().trim().toLowerCase();
  if (raw === "facebook_image" || raw === "image" || raw === "photo") {
    return "facebook_image";
  }
  if (raw === "facebook_text" || raw === "text" || raw === "feed") {
    return "facebook_text";
  }
  // Auto: image mode when path/url present
  if (
    options?.imagePath ||
    options?.imageUrl ||
    asset?.imagePath ||
    (asset?.metadata as Record<string, unknown> | null)?.imagePath
  ) {
    return "facebook_image";
  }
  return "facebook_text";
}

export function buildFacebookImagePayload(
  asset: PublishableAsset,
  options?: PublishOptions
): {
  publishMode: "facebook_image";
  caption: string;
  imagePath: string | null;
  imageUrl: string | null;
  assetId: string;
  mimeType: string | null;
} {
  const caption = messageFor(asset, options);
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const imagePath =
    options?.imagePath ||
    asset.imagePath ||
    (typeof meta.imagePath === "string" ? meta.imagePath : null) ||
    (typeof meta.storagePath === "string" ? meta.storagePath : null);
  const imageUrl =
    options?.imageUrl ||
    (typeof meta.imageUrl === "string" ? meta.imageUrl : null) ||
    null;
  return {
    publishMode: "facebook_image",
    caption,
    imagePath: imagePath ?? null,
    imageUrl,
    assetId: asset.id,
    mimeType: asset.imageMimeType ?? (typeof meta.mimeType === "string" ? meta.mimeType : null),
  };
}

async function livePublishText(
  asset: PublishableAsset,
  page: PublishPageContext,
  options?: PublishOptions
): Promise<PublishResult> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!.trim();
  const pageId = process.env.FACEBOOK_PAGE_ID!.trim();
  const message = messageFor(asset, options);

  const url = `${GRAPH}/${encodeURIComponent(pageId)}/feed`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      access_token: token,
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      typeof raw.error === "object" &&
      raw.error &&
      typeof (raw.error as { message?: string }).message === "string"
        ? (raw.error as { message: string }).message
        : `Facebook Graph error HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  const externalId =
    typeof raw.id === "string" ? raw.id : `fb_${asset.id}_${Date.now()}`;
  return {
    externalId,
    url: `https://facebook.com/${externalId}`,
    mode: "live",
    platform: "facebook",
    publishMode: "facebook_text",
    assetType: "text",
    raw: {
      adapter: "facebook",
      publishMode: "facebook_text",
      graph: { id: raw.id ?? null },
      pageSlug: page?.slug ?? null,
      live: true,
    },
  };
}

async function livePublishImage(
  asset: PublishableAsset,
  page: PublishPageContext,
  options?: PublishOptions
): Promise<PublishResult> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!.trim();
  const pageId = process.env.FACEBOOK_PAGE_ID!.trim();
  const payload = buildFacebookImagePayload(asset, options);

  if (!payload.imagePath && !payload.imageUrl) {
    throw new Error("facebook_image requires imagePath or imageUrl");
  }

  // Graph photos: multipart with source file, or url= for hosted image
  const endpoint = `${GRAPH}/${encodeURIComponent(pageId)}/photos`;

  let res: Response;
  if (payload.imagePath && fs.existsSync(payload.imagePath)) {
    const bytes = fs.readFileSync(payload.imagePath);
    const form = new FormData();
    form.append("caption", payload.caption);
    form.append("access_token", token);
    form.append(
      "source",
      new Blob([bytes], { type: payload.mimeType || "image/png" }),
      path.basename(payload.imagePath)
    );
    res = await fetch(endpoint, { method: "POST", body: form });
  } else if (payload.imageUrl) {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: payload.caption,
        url: payload.imageUrl,
        access_token: token,
      }),
    });
  } else {
    throw new Error("facebook_image: image file not found and no imageUrl");
  }

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      typeof raw.error === "object" &&
      raw.error &&
      typeof (raw.error as { message?: string }).message === "string"
        ? (raw.error as { message: string }).message
        : `Facebook photos error HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  const externalId =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.post_id === "string"
        ? raw.post_id
        : `fb_img_${asset.id}_${Date.now()}`;

  return {
    externalId,
    url: `https://facebook.com/${externalId}`,
    mode: "live",
    platform: "facebook",
    publishMode: "facebook_image",
    assetType: "image",
    raw: {
      adapter: "facebook",
      publishMode: "facebook_image",
      graph: { id: raw.id ?? null, post_id: raw.post_id ?? null },
      pageSlug: page?.slug ?? null,
      live: true,
      hadLocalFile: Boolean(payload.imagePath),
    },
  };
}

export const facebookPublisher: PublisherAdapter = {
  name: "facebook",
  platform: "facebook",
  isConfigured() {
    return facebookCredentialsPresent();
  },
  async publish(asset, page, options): Promise<PublishResult> {
    const publishMode = resolveFacebookPublishMode(options, asset);
    const forceDry = options?.dryRun === true;

    if (forceDry || !facebookCredentialsPresent()) {
      const base = await fixturePublisher.publish(asset, page, {
        ...options,
        dryRun: true,
      });
      const imagePayload =
        publishMode === "facebook_image"
          ? buildFacebookImagePayload(asset, options)
          : null;

      return {
        ...base,
        platform: "facebook",
        mode: "dry-run",
        publishMode,
        assetType: publishMode === "facebook_image" ? "image" : "text",
        externalId: `fb_dry_${publishMode === "facebook_image" ? "img_" : ""}${asset.id.slice(0, 8)}_${Date.now().toString(36)}`,
        url: `https://facebook.com/dry-run/${asset.id}`,
        raw: {
          ...base.raw,
          adapter: "facebook",
          publishMode,
          assetType: publishMode === "facebook_image" ? "image" : "text",
          imagePayload: imagePayload
            ? {
                // Never include file bytes; path basename only for safety in logs
                captionPreview: imagePayload.caption.slice(0, 160),
                hasImagePath: Boolean(imagePayload.imagePath),
                imageBasename: imagePayload.imagePath
                  ? path.basename(imagePayload.imagePath)
                  : null,
                hasImageUrl: Boolean(imagePayload.imageUrl),
                mimeType: imagePayload.mimeType,
              }
            : null,
          reason: forceDry
            ? "dryRun option"
            : "missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID",
          configured: facebookCredentialsPresent(),
        },
      };
    }

    if (publishMode === "facebook_image") {
      return livePublishImage(asset, page, options);
    }
    return livePublishText(asset, page, options);
  },
};
