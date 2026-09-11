/** Phase 9 media generation contracts — real files on disk, never fake-only URLs. */

export type AspectRatio = "1:1" | "4:5" | "16:9" | "9:16" | "3:2" | "2:3";

export type GenerateImageRequest = {
  prompt: string;
  negativeConstraints?: string[];
  aspectRatio?: AspectRatio;
  width?: number;
  height?: number;
  style?: string;
  context?: Record<string, unknown>;
  referenceAssets?: string[];
  /** Override output directory (tests use tmp). Default: storage/generated */
  outputDir?: string;
  /** Force fixture even if OPENAI_API_KEY present */
  forceFixture?: boolean;
  /** Max live retries on transient failure */
  maxRetries?: number;
};

export type GenerateImageResult = {
  provider: string;
  model: string;
  mediaPath: string;
  url?: string;
  mimeType: string;
  width: number;
  height: number;
  generationId: string;
  metadata: Record<string, unknown>;
};

export interface ImageProvider {
  name: string;
  mode: "fixture" | "live";
  isConfigured(): boolean;
  generateImage(req: GenerateImageRequest): Promise<GenerateImageResult>;
}
