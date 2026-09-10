/**
 * Preference weights — Phase 7 learning memory.
 * Accumulated evidence updates weights; Page DNA is NEVER rewritten here.
 * Overlay only applies when evidenceCount >= EVIDENCE_THRESHOLD.
 */

import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";

export const EVIDENCE_THRESHOLD = 5;
/** Max absolute soft-boost points applied to rankScore (not base QC total). */
export const MAX_PREF_BOOST = 8;
export const MAX_PERF_BOOST = 6;

export type PreferenceDimension =
  | "visual_universe"
  | "format"
  | "tone"
  | "conflict"
  | "metaphor"
  | "caption_length";

export type PreferenceSignal = {
  dimension: PreferenceDimension;
  key: string;
  /** Signed delta before clamping, e.g. -0.15 reject, +0.12 approve */
  delta: number;
  action:
    | "approve"
    | "reject"
    | "edit"
    | "favorite"
    | "regenerate"
    | "publish";
};

export type PreferenceWeightRow = {
  id: string;
  pageId: string;
  dimension: string;
  key: string;
  weight: number;
  evidenceCount: number;
  approveCount: number;
  rejectCount: number;
  favoriteCount: number;
  editCount: number;
  confidence: number;
  metadata: unknown;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function computeConfidence(evidenceCount: number): number {
  // Reaches ~0.5 at threshold, approaches 1 as evidence grows
  return clamp(evidenceCount / (EVIDENCE_THRESHOLD * 2), 0, 1);
}

/**
 * Effective overlay multiplier in [-1, 1] only when evidence >= threshold.
 * Below threshold → 0 (no influence on ranking / Page DNA).
 */
export function effectivePreferenceStrength(
  weight: number,
  evidenceCount: number,
  confidence?: number
): number {
  if (evidenceCount < EVIDENCE_THRESHOLD) return 0;
  const conf = confidence ?? computeConfidence(evidenceCount);
  return clamp(weight, -1, 1) * conf;
}

export async function getPreferenceWeights(opts: {
  pageId: string;
  dimension?: string;
  minEvidence?: number;
}): Promise<PreferenceWeightRow[]> {
  const rows = await prisma.preferenceWeight.findMany({
    where: {
      pageId: opts.pageId,
      ...(opts.dimension ? { dimension: opts.dimension } : {}),
      ...(opts.minEvidence != null
        ? { evidenceCount: { gte: opts.minEvidence } }
        : {}),
    },
    orderBy: [{ evidenceCount: "desc" }, { weight: "desc" }],
  });
  return rows;
}

export async function getPreferenceSummary(opts: {
  pageId?: string;
  pageSlug?: string;
}) {
  let pageId = opts.pageId;
  if (!pageId && opts.pageSlug) {
    const page = await prisma.page.findUnique({
      where: { slug: opts.pageSlug },
    });
    pageId = page?.id;
  }
  if (!pageId) {
    const page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
    });
    pageId = page?.id;
  }
  if (!pageId) throw new Error("Page not found for preference summary");

  const weights = await getPreferenceWeights({ pageId });
  const active = weights.filter((w) => w.evidenceCount >= EVIDENCE_THRESHOLD);
  const byDimension: Record<string, PreferenceWeightRow[]> = {};
  for (const w of weights) {
    (byDimension[w.dimension] ??= []).push(w);
  }

  return {
    pageId,
    threshold: EVIDENCE_THRESHOLD,
    totalKeys: weights.length,
    activeKeys: active.length,
    weights,
    byDimension,
    note: "Preference weights overlay ranking only; Page DNA is never rewritten by feedback.",
  };
}

/**
 * Upsert a preference signal into preference_weights.
 * Does NOT touch page_dna.
 */
export async function applyPreferenceSignal(opts: {
  pageId: string;
  signal: PreferenceSignal;
  metadata?: Record<string, unknown>;
}): Promise<PreferenceWeightRow> {
  const { pageId, signal } = opts;
  const key = signal.key.trim();
  if (!key) throw new Error("preference key required");

  const existing = await prisma.preferenceWeight.findUnique({
    where: {
      pageId_dimension_key: {
        pageId,
        dimension: signal.dimension,
        key,
      },
    },
  });

  const action = signal.action;
  const approveInc = action === "approve" ? 1 : 0;
  const rejectInc = action === "reject" ? 1 : 0;
  const favoriteInc = action === "favorite" ? 1 : 0;
  const editInc = action === "edit" ? 1 : 0;

  if (!existing) {
    const evidenceCount = 1;
    const weight = clamp(signal.delta, -1, 1);
    return prisma.preferenceWeight.create({
      data: {
        pageId,
        dimension: signal.dimension,
        key,
        weight,
        evidenceCount,
        approveCount: approveInc,
        rejectCount: rejectInc,
        favoriteCount: favoriteInc,
        editCount: editInc,
        confidence: computeConfidence(evidenceCount),
        metadata: (opts.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  const evidenceCount = existing.evidenceCount + 1;
  // Accumulate signed evidence; clamp to [-1, 1]
  const weight = clamp(existing.weight + signal.delta, -1, 1);

  return prisma.preferenceWeight.update({
    where: { id: existing.id },
    data: {
      weight,
      evidenceCount,
      approveCount: existing.approveCount + approveInc,
      rejectCount: existing.rejectCount + rejectInc,
      favoriteCount: existing.favoriteCount + favoriteInc,
      editCount: existing.editCount + editInc,
      confidence: computeConfidence(evidenceCount),
      metadata: (opts.metadata ?? existing.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });
}

export async function applyPreferenceSignals(opts: {
  pageId: string;
  signals: PreferenceSignal[];
  metadata?: Record<string, unknown>;
}): Promise<PreferenceWeightRow[]> {
  const out: PreferenceWeightRow[] = [];
  for (const signal of opts.signals) {
    out.push(
      await applyPreferenceSignal({
        pageId: opts.pageId,
        signal,
        metadata: opts.metadata,
      })
    );
  }
  return out;
}

/**
 * Soft preference overlay points for a candidate (rankScore only).
 * Returns 0 when no weights meet the evidence threshold.
 */
export function preferenceOverlayBoost(
  candidate: {
    format?: string | null;
    primaryConflict?: string | null;
    visualUniverse?: string | null;
    visualMetaphor?: string | null;
    tones?: string[] | null;
  },
  weights: Array<{
    dimension: string;
    key: string;
    weight: number;
    evidenceCount: number;
    confidence: number;
  }>
): number {
  if (!weights.length) return 0;

  const lookup = (
    dimension: string,
    key: string | null | undefined
  ): number => {
    if (!key) return 0;
    const row = weights.find(
      (w) => w.dimension === dimension && w.key === key
    );
    if (!row) return 0;
    return effectivePreferenceStrength(
      row.weight,
      row.evidenceCount,
      row.confidence
    );
  };

  let raw = 0;
  raw += lookup("visual_universe", candidate.visualUniverse);
  raw += lookup("format", candidate.format);
  raw += lookup("conflict", candidate.primaryConflict);
  if (candidate.visualMetaphor) {
    // Exact metaphor key or first-token cluster
    raw += lookup("metaphor", candidate.visualMetaphor);
    const cluster = candidate.visualMetaphor
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    if (cluster !== candidate.visualMetaphor) {
      raw += lookup("metaphor", cluster) * 0.5;
    }
  }
  if (candidate.tones?.length) {
    for (const t of candidate.tones) {
      raw += lookup("tone", t) * 0.5;
    }
  }
  // caption_length keys are stored for analytics/settings; they do not blanket-boost rankScore

  return clamp(raw * MAX_PREF_BOOST, -MAX_PREF_BOOST, MAX_PREF_BOOST);
}
