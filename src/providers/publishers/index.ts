/**
 * Publisher registry — resolve by platform; report configuration status
 * without exposing secret values.
 */

import type {
  PublishPlatform,
  PublisherAdapter,
  PublisherStatus,
} from "./types";
import { fixturePublisher } from "./fixture";
import {
  facebookPublisher,
  facebookCredentialsPresent,
} from "./facebook";
import {
  instagramPublisher,
  instagramCredentialsPresent,
} from "./instagram";
import {
  wordpressPublisher,
  wordpressCredentialsPresent,
} from "./wordpress";

export * from "./types";
export { fixturePublisher } from "./fixture";
export {
  facebookPublisher,
  buildFacebookImagePayload,
  resolveFacebookPublishMode,
  facebookCredentialsPresent,
} from "./facebook";
export { instagramPublisher } from "./instagram";
export { wordpressPublisher } from "./wordpress";

const REGISTRY: Record<PublishPlatform, PublisherAdapter> = {
  fixture: fixturePublisher,
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  wordpress: wordpressPublisher,
};

const ENV_KEYS: Record<PublishPlatform, string[]> = {
  fixture: [],
  facebook: ["FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID"],
  instagram: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"],
  wordpress: ["WP_URL", "WP_USERNAME", "WP_APP_PASSWORD"],
};

export function normalizePlatform(raw: string): PublishPlatform {
  const p = raw.trim().toLowerCase();
  if (p === "fb") return "facebook";
  if (p === "ig") return "instagram";
  if (p === "wp") return "wordpress";
  if (
    p === "fixture" ||
    p === "facebook" ||
    p === "instagram" ||
    p === "wordpress"
  ) {
    return p;
  }
  throw new Error(
    `Unknown platform: ${raw}. Use fixture | facebook | instagram | wordpress`
  );
}

export function getPublisher(platform: string): PublisherAdapter {
  const key = normalizePlatform(platform);
  return REGISTRY[key];
}

export function listPublishers(): PublisherAdapter[] {
  return Object.values(REGISTRY);
}

function presentEnvKeys(keys: string[]): string[] {
  return keys.filter((k) => Boolean(process.env[k]?.trim()));
}

export function getPublisherStatuses(): PublisherStatus[] {
  return (Object.keys(REGISTRY) as PublishPlatform[]).map((platform) => {
    const requiredEnv = ENV_KEYS[platform];
    const presentEnv = presentEnvKeys(requiredEnv);
    const configured =
      platform === "fixture"
        ? true
        : platform === "facebook"
          ? facebookCredentialsPresent()
          : platform === "instagram"
            ? instagramCredentialsPresent()
            : wordpressCredentialsPresent();
    return {
      platform,
      configured,
      mode: configured && platform !== "fixture" ? "live" : "fixture",
      requiredEnv,
      presentEnv,
    };
  });
}
