/**
 * Live OpenAI Images API — only when OPENAI_API_KEY present.
 * Downloads bytes to local storage; never claims success without a real file.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { GenerateImageRequest, GenerateImageResult, ImageProvider } from "./types";
import { defaultStorageDir, ensureDir } from "./png";

const OPENAI_IMAGES = "https://api.openai.com/v1/images/generations";

export function openaiImageCredentialsPresent(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function sizeFor(req: GenerateImageRequest): string {
  const w = req.width ?? 1024;
  const h = req.height ?? 1024;
  // dall-e-3 supports 1024x1024, 1792x1024, 1024x1792
  if (req.aspectRatio === "16:9" || w > h * 1.2) return "1792x1024";
  if (req.aspectRatio === "9:16" || h > w * 1.2) return "1024x1792";
  return "1024x1024";
}

function dimsFromSize(size: string): { width: number; height: number } {
  const [w, h] = size.split("x").map(Number);
  return { width: w || 1024, height: h || 1024 };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export const openaiImageProvider: ImageProvider = {
  name: "openai",
  mode: "live",
  isConfigured() {
    return openaiImageCredentialsPresent();
  },
  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    if (!openaiImageCredentialsPresent()) {
      throw new Error("OPENAI_API_KEY missing — cannot run live image generation");
    }
    if (!req.prompt?.trim()) {
      throw new Error("generateImage requires a non-empty prompt");
    }

    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3";
    const size = sizeFor(req);
    const dims = dimsFromSize(size);
    const maxRetries = req.maxRetries ?? 2;

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const neg = (req.negativeConstraints ?? []).join(", ");
        const fullPrompt = neg
          ? `${req.prompt.trim()}\n\nAvoid: ${neg}`
          : req.prompt.trim();

        const res = await fetch(OPENAI_IMAGES, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: fullPrompt.slice(0, 4000),
            size,
            n: 1,
            response_format: "url",
          }),
        });

        const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          const msg =
            typeof raw.error === "object" &&
            raw.error &&
            typeof (raw.error as { message?: string }).message === "string"
              ? (raw.error as { message: string }).message
              : `OpenAI images HTTP ${res.status}`;
          // Never include API key in error
          throw new Error(msg);
        }

        const data = raw.data as Array<{ url?: string; b64_json?: string }> | undefined;
        const first = data?.[0];
        if (!first) throw new Error("OpenAI images: empty data");

        const outputDir = req.outputDir ?? defaultStorageDir();
        ensureDir(outputDir);
        const generationId = `oai_${crypto.randomBytes(8).toString("hex")}`;
        const mediaPath = path.join(outputDir, `${generationId}.png`);

        if (first.b64_json) {
          fs.writeFileSync(mediaPath, Buffer.from(first.b64_json, "base64"));
        } else if (first.url) {
          const imgRes = await fetch(first.url);
          if (!imgRes.ok) {
            throw new Error(`Failed to download OpenAI image HTTP ${imgRes.status}`);
          }
          const ab = await imgRes.arrayBuffer();
          fs.writeFileSync(mediaPath, Buffer.from(ab));
        } else {
          throw new Error("OpenAI images: no url or b64_json");
        }

        if (!fs.existsSync(mediaPath) || fs.statSync(mediaPath).size < 32) {
          throw new Error("OpenAI image download produced empty/unreadable file");
        }

        return {
          provider: "openai",
          model,
          mediaPath,
          url: first.url,
          mimeType: "image/png",
          width: dims.width,
          height: dims.height,
          generationId,
          metadata: {
            mode: "live",
            size,
            attempt: attempt + 1,
            live: true,
            // Never store tokens
          },
        };
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxRetries) await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr ?? new Error("OpenAI image generation failed");
  },
};
