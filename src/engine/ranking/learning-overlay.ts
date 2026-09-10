/**
 * Soft learning overlay for editorial ranking (Phase 7).
 * Preference weights + performance priors adjust rankScore only —
 * never override hard QC floor / dedup fails (scores.total unchanged).
 */

import type { ScoredWithRank } from "./editorial";
import {
  preferenceOverlayBoost,
  type PreferenceWeightRow,
} from "@/engine/feedback/preferences";
import {
  performanceOverlayBoost,
  type DimensionBucket,
} from "@/analytics/performance";

export type LearningOverlayContext = {
  preferences?: PreferenceWeightRow[];
  performance?: {
    byConflict: DimensionBucket[];
    byVisual: DimensionBucket[];
    byFormat: DimensionBucket[];
  } | null;
};

export function applyLearningOverlay(
  scored: ScoredWithRank,
  ctx: LearningOverlayContext | null | undefined
): ScoredWithRank {
  if (!ctx) return scored;
  const c = scored.candidate;
  const prefBoost = preferenceOverlayBoost(
    {
      format: c.format,
      primaryConflict: c.primaryConflict,
      visualUniverse: c.visualUniverse,
      visualMetaphor: c.visualMetaphor,
      tones: c.lenses ?? null,
    },
    ctx.preferences ?? []
  );
  const perfBoost = performanceOverlayBoost(
    {
      format: c.format,
      primaryConflict: c.primaryConflict,
      visualUniverse: c.visualUniverse,
    },
    ctx.performance ?? null
  );

  const learningBoost = prefBoost + perfBoost;
  if (learningBoost === 0) return scored;

  return {
    ...scored,
    rankScore: scored.rankScore + learningBoost,
    scores: {
      ...scored.scores,
      learningBoost,
      preferenceBoost: prefBoost,
      performanceBoost: perfBoost,
    },
  };
}

export function applyLearningOverlayToPool(
  scored: ScoredWithRank[],
  ctx: LearningOverlayContext | null | undefined
): ScoredWithRank[] {
  if (!ctx) return scored;
  return scored.map((s) => applyLearningOverlay(s, ctx));
}
