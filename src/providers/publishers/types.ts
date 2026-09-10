/**
 * Publishing connector contracts — Facebook / Instagram / WordPress / fixture.
 * Live Graph/REST only when credentials present; otherwise dry-run/fixture.
 */

export type PublishPlatform =
  | "fixture"
  | "facebook"
  | "instagram"
  | "wordpress";

export type PublishMode = "live" | "dry-run" | "fixture";

export type PublishableAsset = {
  id: string;
  title: string;
  body?: string | null;
  format: string;
  status?: string;
  metadata?: unknown;
  pageId?: string | null;
};

export type PublishPageContext = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  /** Platform page / site identifier when relevant */
  externalPageId?: string | null;
} | null;

export type PublishOptions = {
  /** Force dry-run even if credentials exist */
  dryRun?: boolean;
  caption?: string;
  /** Extra platform-specific fields (never secrets) */
  extras?: Record<string, unknown>;
};

export type PublishResult = {
  externalId: string;
  url: string;
  raw: Record<string, unknown>;
  mode: PublishMode;
  platform: PublishPlatform | string;
};

export interface PublisherAdapter {
  name: string;
  platform: PublishPlatform;
  /** True when live credentials are present (does not reveal values). */
  isConfigured(): boolean;
  publish(
    asset: PublishableAsset,
    page: PublishPageContext,
    options?: PublishOptions
  ): Promise<PublishResult>;
}

export type PublisherStatus = {
  platform: PublishPlatform;
  configured: boolean;
  mode: "live" | "fixture";
  requiredEnv: string[];
  presentEnv: string[];
};
