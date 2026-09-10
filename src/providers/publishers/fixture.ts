import type {
  PublishableAsset,
  PublishOptions,
  PublishPageContext,
  PublishResult,
  PublisherAdapter,
} from "./types";

export const fixturePublisher: PublisherAdapter = {
  name: "fixture",
  platform: "fixture",
  isConfigured() {
    return true;
  },
  async publish(
    asset: PublishableAsset,
    page: PublishPageContext,
    options?: PublishOptions
  ): Promise<PublishResult> {
    const stamp = Date.now().toString(36);
    const externalId = `fixture_${asset.id.slice(0, 8)}_${stamp}`;
    const caption =
      options?.caption ??
      (typeof (asset.metadata as Record<string, unknown> | null)?.caption ===
      "string"
        ? ((asset.metadata as Record<string, unknown>).caption as string)
        : asset.title);

    return {
      externalId,
      url: `https://fixture.local/posts/${externalId}`,
      mode: "fixture",
      platform: "fixture",
      raw: {
        adapter: "fixture",
        title: asset.title,
        caption,
        format: asset.format,
        pageSlug: page?.slug ?? null,
        bodyPreview: (asset.body ?? "").slice(0, 120),
        dryRun: options?.dryRun === true,
      },
    };
  },
};
