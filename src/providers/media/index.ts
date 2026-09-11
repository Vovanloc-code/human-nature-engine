/**
 * Media generation entry — fixture writes real PNG; live OpenAI when key present.
 * Never claims live success without a real readable file.
 */
import type { GenerateImageRequest, GenerateImageResult, ImageProvider } from "./types";
import { fixtureImageProvider } from "./fixture";
import {
  openaiImageProvider,
  openaiImageCredentialsPresent,
} from "./openai";
import { isReadableImageFile } from "./png";

export * from "./types";
export { fixtureImageProvider } from "./fixture";
export { openaiImageProvider, openaiImageCredentialsPresent } from "./openai";
export {
  writeFixturePng,
  isReadableImageFile,
  defaultStorageDir,
  encodePng,
} from "./png";

export type MediaProviderMode = "fixture" | "live" | "auto";

export function resolveImageProvider(
  choice: MediaProviderMode = (process.env.HNE_IMAGE_PROVIDER as MediaProviderMode) ||
    "auto"
): { mode: "fixture" | "live"; provider: ImageProvider } {
  const forceFixture =
    choice === "fixture" ||
    process.env.HNE_PROVIDER === "fixture" ||
    process.env.HNE_FIXTURE === "1" ||
    process.env.CI === "true";

  if (forceFixture) {
    return { mode: "fixture", provider: fixtureImageProvider };
  }

  if (
    (choice === "live" || choice === "auto") &&
    openaiImageCredentialsPresent()
  ) {
    return { mode: "live", provider: openaiImageProvider };
  }

  return { mode: "fixture", provider: fixtureImageProvider };
}

export async function generateImage(
  req: GenerateImageRequest
): Promise<GenerateImageResult> {
  if (req.forceFixture) {
    const result = await fixtureImageProvider.generateImage(req);
    assertRealFile(result);
    return result;
  }

  const { mode, provider } = resolveImageProvider();
  try {
    const result = await provider.generateImage(req);
    assertRealFile(result);
    // Never claim live if we fell back somehow
    if (mode === "fixture" && result.metadata) {
      result.metadata.live = false;
    }
    return result;
  } catch (e) {
    // Live failure: do NOT silently claim live success. Optionally fall back to fixture
    // only when explicitly allowed via HNE_IMAGE_FALLBACK=fixture
    const allowFallback =
      process.env.HNE_IMAGE_FALLBACK === "fixture" ||
      process.env.HNE_IMAGE_FALLBACK === "1";
    if (allowFallback && provider.mode === "live") {
      const result = await fixtureImageProvider.generateImage(req);
      assertRealFile(result);
      result.metadata = {
        ...result.metadata,
        live: false,
        fallbackFrom: "openai",
        fallbackReason: e instanceof Error ? e.message : String(e),
      };
      return result;
    }
    throw e;
  }
}

function assertRealFile(result: GenerateImageResult): void {
  if (!result.mediaPath || !isReadableImageFile(result.mediaPath)) {
    throw new Error(
      `Image provider ${result.provider} did not produce a readable file at ${result.mediaPath}`
    );
  }
  // Guard against legacy fixture:// fake URLs without files
  if (result.mediaPath.startsWith("fixture://") || result.url?.startsWith("fixture://")) {
    throw new Error("Fake fixture:// URLs without files are not allowed");
  }
}

export function imageProviderStatus(): {
  mode: "fixture" | "live";
  configured: boolean;
  requiredEnv: string[];
  presentEnv: string[];
} {
  const requiredEnv = ["OPENAI_API_KEY"];
  const presentEnv = requiredEnv.filter((k) => Boolean(process.env[k]?.trim()));
  const { mode } = resolveImageProvider();
  return {
    mode,
    configured: openaiImageCredentialsPresent(),
    requiredEnv,
    presentEnv,
  };
}
