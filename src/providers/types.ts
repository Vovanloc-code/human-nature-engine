/** Provider adapter contracts for LLM / embedding / image generation. */

export type StructuredSchema = Record<string, unknown>;

export interface GenerateStructuredOpts {
  system?: string;
  prompt: string;
  schemaName?: string;
  schema?: StructuredSchema;
  temperature?: number;
  /** Fixture routing key for deterministic outputs */
  fixtureKey?: string;
  context?: Record<string, unknown>;
}

export interface GenerateTextOpts {
  system?: string;
  prompt: string;
  temperature?: number;
  fixtureKey?: string;
  context?: Record<string, unknown>;
}

export interface EmbedOpts {
  texts: string[];
  model?: string;
}

export interface GenerateImageOpts {
  prompt: string;
  size?: string;
  fixtureKey?: string;
}

export interface ProviderAdapter {
  name: string;
  mode: "fixture" | "live";
  generateStructured<T = unknown>(opts: GenerateStructuredOpts): Promise<T>;
  generateText(opts: GenerateTextOpts): Promise<string>;
  embed(opts: EmbedOpts): Promise<number[][]>;
  generateImage(opts: GenerateImageOpts): Promise<{ url: string; meta?: Record<string, unknown> }>;
}
