/**
 * Optional live OpenAI / xAI adapters.
 * Only used when API keys are present. Tests must not require keys.
 */

import type {
  EmbedOpts,
  GenerateImageOpts,
  GenerateStructuredOpts,
  GenerateTextOpts,
  ProviderAdapter,
} from "./types";

function requireFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  return fetch;
}

async function openAiChat(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string | undefined,
  prompt: string,
  temperature?: number
): Promise<string> {
  const f = requireFetch();
  const res = await f(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: temperature ?? 0.4,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Live provider error ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

function tryParseJson<T>(text: string): T {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(raw) as T;
}

export function createOpenAiProvider(apiKey: string): ProviderAdapter {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const chatModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return {
    name: "openai",
    mode: "live",
    async generateStructured<T>(opts: GenerateStructuredOpts): Promise<T> {
      const content = await openAiChat(
        apiKey,
        baseUrl,
        chatModel,
        opts.system,
        `${opts.prompt}\n\nRespond with valid JSON only.`,
        opts.temperature
      );
      return tryParseJson<T>(content);
    },
    async generateText(opts: GenerateTextOpts): Promise<string> {
      return openAiChat(
        apiKey,
        baseUrl,
        chatModel,
        opts.system,
        opts.prompt,
        opts.temperature
      );
    },
    async embed(opts: EmbedOpts): Promise<number[][]> {
      const f = requireFetch();
      const res = await f(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model ?? "text-embedding-3-small",
          input: opts.texts,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data.map((d) => d.embedding);
    },
    async generateImage(opts: GenerateImageOpts) {
      const f = requireFetch();
      const res = await f(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3",
          prompt: opts.prompt,
          size: opts.size ?? "1024x1024",
          n: 1,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI image failed: ${res.status}`);
      const json = (await res.json()) as { data: Array<{ url?: string }> };
      const url = json.data[0]?.url;
      if (!url) throw new Error("OpenAI image: no url");
      return { url };
    },
  };
}

export function createXaiProvider(apiKey: string): ProviderAdapter {
  const baseUrl = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
  const chatModel = process.env.XAI_MODEL ?? "grok-2-latest";
  return {
    name: "xai",
    mode: "live",
    async generateStructured<T>(opts: GenerateStructuredOpts): Promise<T> {
      const content = await openAiChat(
        apiKey,
        baseUrl,
        chatModel,
        opts.system,
        `${opts.prompt}\n\nRespond with valid JSON only.`,
        opts.temperature
      );
      return tryParseJson<T>(content);
    },
    async generateText(opts: GenerateTextOpts): Promise<string> {
      return openAiChat(
        apiKey,
        baseUrl,
        chatModel,
        opts.system,
        opts.prompt,
        opts.temperature
      );
    },
    async embed(_opts: EmbedOpts): Promise<number[][]> {
      throw new Error("xAI embed not configured — use OpenAI or fixture embed()");
    },
    async generateImage(_opts: GenerateImageOpts) {
      throw new Error("xAI image not configured — use OpenAI or fixture generateImage()");
    },
  };
}
