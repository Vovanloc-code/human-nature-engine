/**
 * Phase 4 embeddings — store / retrieve / semantic search via provider.embed().
 * Values JSON is app source of truth; pgvector column mirrored when dims===64.
 */

import { prisma } from "@/db";
import { getProvider } from "@/providers";
import { cosineSimilarity, l2Normalize } from "@/engine/dedup/math";

export const FIXTURE_EMBED_DIMS = 64;

export type EmbeddingObjectType =
  | "human_insight"
  | "concept"
  | "content_asset"
  | "visual_concept";

export type UpsertEmbeddingInput = {
  objectType: EmbeddingObjectType;
  objectId: string;
  kind?: string;
  text: string;
  /** Precomputed vector; if omitted, calls provider.embed() */
  values?: number[];
  model?: string;
};

export type StoredEmbedding = {
  id: string;
  objectType: string;
  objectId: string;
  kind: string;
  model: string;
  dims: number;
  values: number[];
};

function asNumberArray(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => Number(v));
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = getProvider();
  const vectors = await provider.embed({ texts });
  return vectors.map((v) => l2Normalize(v));
}

export async function upsertEmbedding(
  input: UpsertEmbeddingInput
): Promise<StoredEmbedding> {
  const kind = input.kind ?? "default";
  const provider = getProvider();
  let values = input.values;
  if (!values) {
    const [v] = await embedTexts([input.text]);
    values = v ?? [];
  } else {
    values = l2Normalize(values);
  }
  const model = input.model ?? provider.name;
  const dims = values.length;

  const row = await prisma.embedding.upsert({
    where: {
      objectType_objectId_kind: {
        objectType: input.objectType,
        objectId: input.objectId,
        kind,
      },
    },
    create: {
      objectType: input.objectType,
      objectId: input.objectId,
      kind,
      model,
      dims,
      values,
    },
    update: {
      model,
      dims,
      values,
    },
  });

  if (dims === FIXTURE_EMBED_DIMS) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE embeddings SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(values),
        row.id
      );
    } catch {
      // Non-fatal — Json values still usable for search
    }
  }

  return {
    id: row.id,
    objectType: row.objectType,
    objectId: row.objectId,
    kind: row.kind,
    model: row.model,
    dims: row.dims,
    values: asNumberArray(row.values),
  };
}

export async function getEmbedding(
  objectType: EmbeddingObjectType,
  objectId: string,
  kind = "default"
): Promise<StoredEmbedding | null> {
  const row = await prisma.embedding.findUnique({
    where: {
      objectType_objectId_kind: { objectType, objectId, kind },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    objectType: row.objectType,
    objectId: row.objectId,
    kind: row.kind,
    model: row.model,
    dims: row.dims,
    values: asNumberArray(row.values),
  };
}

export type SemanticHit = {
  objectId: string;
  kind: string;
  score: number;
  model: string;
};

export async function semanticSearch(opts: {
  objectType: EmbeddingObjectType;
  queryText?: string;
  queryValues?: number[];
  kind?: string;
  limit?: number;
  minScore?: number;
}): Promise<SemanticHit[]> {
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0;
  let query = opts.queryValues;
  if (!query && opts.queryText) {
    const [v] = await embedTexts([opts.queryText]);
    query = v;
  }
  if (!query || query.length === 0) return [];

  const rows = await prisma.embedding.findMany({
    where: {
      objectType: opts.objectType,
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
  });

  const scored: SemanticHit[] = [];
  for (const row of rows) {
    const values = asNumberArray(row.values);
    if (values.length === 0) continue;
    if (values.length !== query.length) continue;
    const score = cosineSimilarity(query, values);
    if (score >= minScore) {
      scored.push({
        objectId: row.objectId,
        kind: row.kind,
        score,
        model: row.model,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function searchSimilarInsights(
  queryText: string,
  opts?: { limit?: number; minScore?: number; kind?: string }
): Promise<SemanticHit[]> {
  return semanticSearch({
    objectType: "human_insight",
    queryText,
    kind: opts?.kind ?? "statement",
    limit: opts?.limit,
    minScore: opts?.minScore,
  });
}

export async function searchSimilarConcepts(
  queryText: string,
  opts?: { limit?: number; minScore?: number }
): Promise<SemanticHit[]> {
  return semanticSearch({
    objectType: "concept",
    queryText,
    kind: "concept",
    limit: opts?.limit,
    minScore: opts?.minScore,
  });
}

export function insightEmbedText(insight: {
  statement: string;
  observation?: string | null;
  desire?: string | null;
  hiddenFear?: string | null;
  contradictoryBehavior?: string | null;
  cost?: string | null;
  primaryConflictId?: string | null;
}): string {
  return [
    insight.statement,
    insight.observation,
    insight.desire,
    insight.hiddenFear,
    insight.contradictoryBehavior,
    insight.cost,
    insight.primaryConflictId,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function embedInsightRecord(insight: {
  id: string;
  statement: string;
  observation?: string | null;
  desire?: string | null;
  hiddenFear?: string | null;
  contradictoryBehavior?: string | null;
  cost?: string | null;
  primaryConflictId?: string | null;
}) {
  const statementEmb = await upsertEmbedding({
    objectType: "human_insight",
    objectId: insight.id,
    kind: "statement",
    text: insight.statement,
  });
  const fullEmb = await upsertEmbedding({
    objectType: "human_insight",
    objectId: insight.id,
    kind: "full",
    text: insightEmbedText(insight),
  });
  return { statementEmb, fullEmb };
}

export async function embedConceptRecord(concept: {
  id: string;
  title: string;
  angle?: string | null;
  hook?: string | null;
  thesis?: string | null;
  metadata?: unknown;
}) {
  const meta = (concept.metadata ?? {}) as Record<string, unknown>;
  const text = [
    concept.title,
    concept.angle,
    concept.hook,
    concept.thesis,
    meta.metaphor,
    meta.lens,
    meta.structure,
    meta.ending,
  ]
    .filter(Boolean)
    .join("\n");
  return upsertEmbedding({
    objectType: "concept",
    objectId: concept.id,
    kind: "concept",
    text,
  });
}

export async function embedContentAssetRecord(asset: {
  id: string;
  title: string;
  body?: string | null;
  metadata?: unknown;
}) {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const text = [
    asset.title,
    asset.body,
    meta.hook,
    meta.caption,
    meta.image_text,
    meta.headline,
  ]
    .filter(Boolean)
    .join("\n");
  return upsertEmbedding({
    objectType: "content_asset",
    objectId: asset.id,
    kind: "final_content",
    text,
  });
}

export async function embedVisualConceptRecord(visual: {
  id: string;
  title: string;
  metaphor?: string | null;
  style?: string | null;
  composition?: string | null;
  metadata?: unknown;
}) {
  const meta = (visual.metadata ?? {}) as Record<string, unknown>;
  const text = [
    visual.title,
    visual.metaphor,
    visual.style,
    visual.composition,
    meta.subject,
    meta.environment,
    meta.mood,
    meta.universe,
    meta.generation_prompt,
  ]
    .filter(Boolean)
    .join("\n");
  return upsertEmbedding({
    objectType: "visual_concept",
    objectId: visual.id,
    kind: "visual",
    text,
  });
}
