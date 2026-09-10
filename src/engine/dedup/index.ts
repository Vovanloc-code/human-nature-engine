/**
 * Phase 4 dedup — lexical + semantic + genome similarity.
 */

import {
  cosineSimilarity,
  equalityScore,
  jaccardTokens,
  weightedMean,
  clamp01,
} from "./math";

export * from "./math";

/** Configurable thresholds (defaults per Phase 4 spec). */
export type DedupThresholds = {
  /** Insight similarity >= this → hard duplicate */
  hardDuplicate: number;
  /** Insight similarity >= this (and < hard) → rewrite / manual zone */
  rewriteZone: number;
};

export const DEFAULT_DEDUP_THRESHOLDS: DedupThresholds = {
  hardDuplicate: Number(process.env.HNE_DEDUP_HARD ?? 0.88),
  rewriteZone: Number(process.env.HNE_DEDUP_REWRITE ?? 0.78),
};

export type DedupVerdict =
  | "hard_duplicate"
  | "rewrite_zone"
  | "acceptable"
  | "distinct";

export type SimilarityBreakdown = {
  TEXT_SIMILARITY: number;
  INSIGHT_SIMILARITY: number;
  GENOME_SIMILARITY: number;
  VISUAL_SIMILARITY: number;
};

export type GenomeFields = {
  primaryConflict?: string | null;
  secondaryConflicts?: unknown;
  primaryEmotion?: string | null;
  secondaryEmotion?: string | null;
  lenses?: unknown;
  structure?: string | null;
  visualMetaphor?: string | null;
  endingType?: string | null;
  audienceWounds?: unknown;
  tones?: unknown;
  depthLevel?: string | null;
};

export type InsightCompareFields = {
  statement?: string | null;
  observation?: string | null;
  desire?: string | null;
  hiddenFear?: string | null;
  contradictoryBehavior?: string | null;
  cost?: string | null;
  primaryConflictId?: string | null;
  secondaryConflicts?: unknown;
};

/** Phase 1 helper — lexical overlap placeholder (kept for back-compat). */
export function statementSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function asStringList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [String(v)];
}

function listOverlap(a: unknown, b: unknown): number {
  const sa = new Set(asStringList(a).map((s) => s.toLowerCase().trim()).filter(Boolean));
  const sb = new Set(asStringList(b).map((s) => s.toLowerCase().trim()).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.max(sa.size, sb.size);
}

/**
 * Structured genome similarity: conflict / emotion / lens / metaphor / ending / structure.
 * Combined with optional embedding similarity of serialized genome.
 */
export function genomeSimilarity(
  a: GenomeFields,
  b: GenomeFields,
  embeddingSim?: number
): number {
  const structured = weightedMean([
    { weight: 0.22, score: equalityScore(a.primaryConflict, b.primaryConflict) },
    { weight: 0.1, score: listOverlap(a.secondaryConflicts, b.secondaryConflicts) },
    { weight: 0.14, score: equalityScore(a.primaryEmotion, b.primaryEmotion) },
    { weight: 0.08, score: equalityScore(a.secondaryEmotion, b.secondaryEmotion) },
    { weight: 0.14, score: listOverlap(a.lenses, b.lenses) },
    { weight: 0.14, score: equalityScore(a.visualMetaphor, b.visualMetaphor) },
    { weight: 0.1, score: equalityScore(a.endingType, b.endingType) },
    { weight: 0.08, score: equalityScore(a.structure, b.structure) },
  ]);

  if (embeddingSim === undefined) return structured;
  return weightedMean([
    { weight: 0.65, score: structured },
    { weight: 0.35, score: clamp01(embeddingSim) },
  ]);
}

export function serializeGenome(g: GenomeFields): string {
  return [
    g.primaryConflict,
    asStringList(g.secondaryConflicts).join(","),
    g.primaryEmotion,
    g.secondaryEmotion,
    asStringList(g.lenses).join(","),
    g.structure,
    g.visualMetaphor,
    g.endingType,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Insight-field similarity (core truth + conflict + motive + contradiction + cost).
 * Blends embedding similarity of statements with structured field overlap.
 */
export function insightFieldSimilarity(
  a: InsightCompareFields,
  b: InsightCompareFields,
  statementEmbedSim?: number
): number {
  const structured = weightedMean([
    {
      weight: 0.28,
      score: jaccardTokens(a.statement ?? "", b.statement ?? ""),
    },
    {
      weight: 0.12,
      score: jaccardTokens(a.observation ?? "", b.observation ?? ""),
    },
    { weight: 0.12, score: jaccardTokens(a.desire ?? "", b.desire ?? "") },
    {
      weight: 0.14,
      score: jaccardTokens(a.hiddenFear ?? "", b.hiddenFear ?? ""),
    },
    {
      weight: 0.14,
      score: jaccardTokens(
        a.contradictoryBehavior ?? "",
        b.contradictoryBehavior ?? ""
      ),
    },
    { weight: 0.1, score: jaccardTokens(a.cost ?? "", b.cost ?? "") },
    {
      weight: 0.1,
      score: equalityScore(a.primaryConflictId, b.primaryConflictId),
    },
  ]);

  if (statementEmbedSim === undefined) return structured;
  // Embedding carries semantic paraphrase signal; weight it heavily.
  // Matching primary conflict adds a small boost when embed already strong.
  let blended = weightedMean([
    { weight: 0.72, score: clamp01(statementEmbedSim) },
    { weight: 0.28, score: structured },
  ]);
  if (
    a.primaryConflictId &&
    a.primaryConflictId === b.primaryConflictId &&
    statementEmbedSim >= 0.78
  ) {
    blended = clamp01(blended + 0.06);
  }
  return blended;
}

export function textSimilarity(
  a: string,
  b: string,
  embedSim?: number
): number {
  const lexical = jaccardTokens(a, b);
  if (embedSim === undefined) return lexical;
  return weightedMean([
    { weight: 0.6, score: clamp01(embedSim) },
    { weight: 0.4, score: lexical },
  ]);
}

export function visualSimilarity(
  a: { metaphor?: string | null; title?: string | null; universe?: string | null },
  b: { metaphor?: string | null; title?: string | null; universe?: string | null },
  embedSim?: number
): number {
  const structured = weightedMean([
    { weight: 0.5, score: equalityScore(a.metaphor, b.metaphor) },
    { weight: 0.25, score: jaccardTokens(a.title ?? "", b.title ?? "") },
    { weight: 0.25, score: equalityScore(a.universe, b.universe) },
  ]);
  if (embedSim === undefined) return structured;
  return weightedMean([
    { weight: 0.55, score: clamp01(embedSim) },
    { weight: 0.45, score: structured },
  ]);
}

/**
 * Combine similarities into a verdict.
 * Primary signal: INSIGHT_SIMILARITY thresholds.
 * Genome can escalate borderline cases into rewrite_zone / hard_duplicate.
 */
export function judgeFromSimilarities(
  sims: SimilarityBreakdown,
  thresholds: DedupThresholds = DEFAULT_DEDUP_THRESHOLDS
): { verdict: DedupVerdict; combined: number; reason: string } {
  const insight = sims.INSIGHT_SIMILARITY;
  const genome = sims.GENOME_SIMILARITY;
  const combined = weightedMean([
    { weight: 0.45, score: insight },
    { weight: 0.25, score: genome },
    { weight: 0.15, score: sims.TEXT_SIMILARITY },
    { weight: 0.15, score: sims.VISUAL_SIMILARITY },
  ]);

  let verdict: DedupVerdict;
  let reason: string;

  if (insight >= thresholds.hardDuplicate) {
    verdict = "hard_duplicate";
    reason = `Insight similarity ${insight.toFixed(3)} >= ${thresholds.hardDuplicate} (hard duplicate)`;
  } else if (
    insight >= thresholds.rewriteZone ||
    (insight >= thresholds.rewriteZone - 0.05 && genome >= 0.85)
  ) {
    // Genome contribution: escalate near-rewrite into rewrite zone
    if (insight < thresholds.rewriteZone && genome >= 0.85) {
      verdict = "rewrite_zone";
      reason = `Insight ${insight.toFixed(3)} near rewrite floor; genome ${genome.toFixed(3)} escalates to rewrite_zone`;
    } else if (
      insight >= thresholds.rewriteZone &&
      genome >= 0.92 &&
      insight >= thresholds.hardDuplicate - 0.04
    ) {
      verdict = "hard_duplicate";
      reason = `Insight ${insight.toFixed(3)} + genome ${genome.toFixed(3)} escalate to hard_duplicate`;
    } else {
      verdict = "rewrite_zone";
      reason = `Insight similarity ${insight.toFixed(3)} in rewrite zone [${thresholds.rewriteZone}, ${thresholds.hardDuplicate})`;
    }
  } else if (combined < 0.45 && insight < 0.55) {
    verdict = "distinct";
    reason = `Low insight ${insight.toFixed(3)} and combined ${combined.toFixed(3)} — distinct`;
  } else {
    verdict = "acceptable";
    reason = `Insight similarity ${insight.toFixed(3)} < ${thresholds.rewriteZone} — normally acceptable`;
  }

  return { verdict, combined, reason };
}

export function vectorSimilarity(a: number[], b: number[]): number {
  return cosineSimilarity(a, b);
}
