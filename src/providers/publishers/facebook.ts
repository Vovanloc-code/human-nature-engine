/**
 * Facebook Page publisher via Graph API.
 * Live only when FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_PAGE_ID are set;
 * otherwise safe dry-run (no throw, no secret leakage).
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

async function livePublish(
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
    // Never include tokens in thrown errors
    throw new Error(errMsg);
  }

  const externalId =
    typeof raw.id === "string" ? raw.id : `fb_${asset.id}_${Date.now()}`;
  return {
    externalId,
    url: `https://facebook.com/${externalId}`,
    mode: "live",
    platform: "facebook",
    raw: {
      adapter: "facebook",
      graph: { id: raw.id ?? null },
      pageSlug: page?.slug ?? null,
      live: true,
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
    const forceDry = options?.dryRun === true;
    if (forceDry || !facebookCredentialsPresent()) {
      const base = await fixturePublisher.publish(asset, page, {
        ...options,
        dryRun: true,
      });
      return {
        ...base,
        platform: "facebook",
        mode: "dry-run",
        externalId: `fb_dry_${asset.id.slice(0, 8)}_${Date.now().toString(36)}`,
        url: `https://facebook.com/dry-run/${asset.id}`,
        raw: {
          ...base.raw,
          adapter: "facebook",
          reason: forceDry
            ? "dryRun option"
            : "missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID",
          configured: facebookCredentialsPresent(),
        },
      };
    }
    return livePublish(asset, page, options);
  },
};
