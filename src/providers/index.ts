/**
 * Provider adapter entry — fixture/deterministic by default;
 * optional live OpenAI/xAI when env keys present.
 */

import type { ProviderAdapter } from "./types";
import { fixtureProvider } from "./fixture";
import { createOpenAiProvider, createXaiProvider } from "./live";

export type { ProviderAdapter } from "./types";
export * from "./types";
export { fixtureProvider } from "./fixture";

export type ProviderChoice = "fixture" | "openai" | "xai" | "auto";

export function resolveProviderMode(
  choice: ProviderChoice = (process.env.HNE_PROVIDER as ProviderChoice) || "auto"
): { mode: "fixture" | "live"; name: string; provider: ProviderAdapter } {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const forceFixture =
    process.env.HNE_PROVIDER === "fixture" ||
    process.env.HNE_FIXTURE === "1" ||
    process.env.CI === "true" ||
    choice === "fixture";

  if (forceFixture) {
    return { mode: "fixture", name: "fixture", provider: fixtureProvider };
  }

  if (choice === "openai" && openaiKey) {
    return { mode: "live", name: "openai", provider: createOpenAiProvider(openaiKey) };
  }
  if (choice === "xai" && xaiKey) {
    return { mode: "live", name: "xai", provider: createXaiProvider(xaiKey) };
  }

  if (choice === "auto") {
    if (openaiKey) {
      return { mode: "live", name: "openai", provider: createOpenAiProvider(openaiKey) };
    }
    if (xaiKey) {
      return { mode: "live", name: "xai", provider: createXaiProvider(xaiKey) };
    }
  }

  // No keys — deterministic fixture (do not claim live LLM)
  return { mode: "fixture", name: "fixture", provider: fixtureProvider };
}

export function getProvider(choice?: ProviderChoice): ProviderAdapter {
  return resolveProviderMode(choice).provider;
}

/** @deprecated Phase-1 stub shape — prefer getProvider() */
export interface LlmProvider {
  complete(prompt: string, opts?: Record<string, unknown>): Promise<string>;
}

export const providers = {
  get: getProvider,
  fixture: fixtureProvider,
};
