import type { GenerateImageRequest, GenerateImageResult, ImageProvider } from "./types";
import { defaultStorageDir, writeFixturePng } from "./png";

export const fixtureImageProvider: ImageProvider = {
  name: "fixture",
  mode: "fixture",
  isConfigured() {
    return true;
  },
  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    if (!req.prompt?.trim()) {
      throw new Error("generateImage requires a non-empty prompt");
    }
    const outputDir = req.outputDir ?? defaultStorageDir();
    const written = writeFixturePng({
      outputDir,
      width: req.width,
      height: req.height,
      aspectRatio: req.aspectRatio,
      seed: `${req.prompt}|${req.style ?? ""}|${(req.negativeConstraints ?? []).join(",")}`,
    });
    return {
      provider: "fixture",
      model: "fixture-png-v1",
      mediaPath: written.mediaPath,
      mimeType: "image/png",
      width: written.width,
      height: written.height,
      generationId: written.generationId,
      metadata: {
        mode: "fixture",
        promptPreview: req.prompt.slice(0, 120),
        negativeConstraints: req.negativeConstraints ?? [],
        aspectRatio: req.aspectRatio ?? "1:1",
        style: req.style ?? null,
        live: false,
      },
    };
  },
};
