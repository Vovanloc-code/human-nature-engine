/**
 * WordPress REST publisher.
 * Live only when WP_URL + WP_USERNAME + WP_APP_PASSWORD are set;
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

export function wordpressCredentialsPresent(): boolean {
  return Boolean(
    process.env.WP_URL?.trim() &&
      process.env.WP_USERNAME?.trim() &&
      process.env.WP_APP_PASSWORD?.trim()
  );
}

function contentFor(asset: PublishableAsset, options?: PublishOptions): string {
  if (options?.caption?.trim()) return options.caption.trim();
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.caption === "string" && meta.caption.trim()) {
    return [asset.title, meta.caption as string, asset.body ?? ""]
      .filter(Boolean)
      .join("\n\n");
  }
  return [asset.title, asset.body ?? ""].filter(Boolean).join("\n\n");
}

async function livePublish(
  asset: PublishableAsset,
  page: PublishPageContext,
  options?: PublishOptions
): Promise<PublishResult> {
  const baseUrl = process.env.WP_URL!.trim().replace(/\/$/, "");
  const username = process.env.WP_USERNAME!.trim();
  const appPassword = process.env.WP_APP_PASSWORD!.trim();
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

  const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      title: asset.title,
      content: contentFor(asset, options),
      status: "publish",
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof raw.message === "string"
        ? raw.message
        : `WordPress REST error HTTP ${res.status}`;
    throw new Error(msg);
  }

  const externalId =
    raw.id != null ? String(raw.id) : `wp_${asset.id}_${Date.now()}`;
  const link =
    typeof raw.link === "string"
      ? raw.link
      : `${baseUrl}/?p=${externalId}`;

  return {
    externalId,
    url: link,
    mode: "live",
    platform: "wordpress",
    raw: {
      adapter: "wordpress",
      id: raw.id ?? null,
      link: typeof raw.link === "string" ? raw.link : null,
      pageSlug: page?.slug ?? null,
      live: true,
    },
  };
}

export const wordpressPublisher: PublisherAdapter = {
  name: "wordpress",
  platform: "wordpress",
  isConfigured() {
    return wordpressCredentialsPresent();
  },
  async publish(asset, page, options): Promise<PublishResult> {
    const forceDry = options?.dryRun === true;
    if (forceDry || !wordpressCredentialsPresent()) {
      const base = await fixturePublisher.publish(asset, page, {
        ...options,
        dryRun: true,
      });
      return {
        ...base,
        platform: "wordpress",
        mode: "dry-run",
        externalId: `wp_dry_${asset.id.slice(0, 8)}_${Date.now().toString(36)}`,
        url: `https://wordpress.local/dry-run/${asset.id}`,
        raw: {
          ...base.raw,
          adapter: "wordpress",
          reason: forceDry
            ? "dryRun option"
            : "missing WP_URL, WP_USERNAME, or WP_APP_PASSWORD",
          configured: wordpressCredentialsPresent(),
        },
      };
    }
    return livePublish(asset, page, options);
  },
};
