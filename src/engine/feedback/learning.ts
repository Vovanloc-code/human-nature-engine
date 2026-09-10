/**
 * Feedback → preference signals (Phase 7).
 * Every human action becomes training signal; Page DNA is never rewritten.
 */

import { prisma } from "@/db";
import type { FeedbackAction } from "@prisma/client";
import {
  applyPreferenceSignals,
  type PreferenceSignal,
  type PreferenceDimension,
  type PreferenceWeightRow,
} from "./preferences";

export type AssetPreferenceSnapshot = {
  contentAssetId: string;
  pageId: string | null;
  format: string | null;
  primaryConflict: string | null;
  visualUniverse: string | null;
  visualMetaphor: string | null;
  tones: string[];
  caption: string | null;
};

async function loadAssetSnapshot(
  contentAssetId: string
): Promise<AssetPreferenceSnapshot | null> {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      genome: true,
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!asset) return null;
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const visual = asset.visualConcepts[0];
  const vMeta = (visual?.metadata ?? {}) as Record<string, unknown>;
  const tonesRaw = asset.genome?.tones;
  const tones = Array.isArray(tonesRaw)
    ? (tonesRaw.filter((t) => typeof t === "string") as string[])
    : [];

  return {
    contentAssetId: asset.id,
    pageId: asset.pageId,
    format: asset.format,
    primaryConflict: asset.genome?.primaryConflict ?? null,
    visualUniverse:
      typeof vMeta.universe === "string"
        ? vMeta.universe
        : visual?.style ?? null,
    visualMetaphor:
      asset.genome?.visualMetaphor ?? visual?.metaphor ?? null,
    tones,
    caption: typeof meta.caption === "string" ? meta.caption : null,
  };
}

function deltaForAction(action: FeedbackAction): number {
  switch (action) {
    case "reject":
      return -0.14;
    case "approve":
      return 0.1;
    case "favorite":
      return 0.16;
    case "publish":
      return 0.12;
    case "regenerate":
      return -0.06;
    case "edit":
      return 0.02; // mild; caption length handled separately
    default:
      return 0;
  }
}

function pushSignal(
  signals: PreferenceSignal[],
  dimension: PreferenceDimension,
  key: string | null | undefined,
  delta: number,
  action: FeedbackAction
) {
  if (!key?.trim() || delta === 0) return;
  signals.push({
    dimension,
    key: key.trim(),
    delta,
    action,
  });
}

/**
 * Derive preference signals from a feedback action + asset genome/visual.
 */
export function derivePreferenceSignals(
  snapshot: AssetPreferenceSnapshot,
  action: FeedbackAction,
  opts?: {
    /** Previous caption before edit (for length preference). */
    previousCaption?: string | null;
    /** New caption after edit. */
    newCaption?: string | null;
  }
): PreferenceSignal[] {
  const base = deltaForAction(action);
  const signals: PreferenceSignal[] = [];

  // Rejects / regenerates / approves / favorites / publish hit creative dims
  if (
    action === "reject" ||
    action === "approve" ||
    action === "favorite" ||
    action === "publish" ||
    action === "regenerate"
  ) {
    pushSignal(signals, "visual_universe", snapshot.visualUniverse, base, action);
    pushSignal(signals, "format", snapshot.format, base, action);
    pushSignal(signals, "conflict", snapshot.primaryConflict, base, action);
    if (snapshot.visualMetaphor) {
      pushSignal(
        signals,
        "metaphor",
        snapshot.visualMetaphor,
        base * 0.85,
        action
      );
      const cluster = snapshot.visualMetaphor
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
      pushSignal(signals, "metaphor", cluster, base * 0.5, action);
    }
    for (const tone of snapshot.tones) {
      pushSignal(signals, "tone", tone, base * 0.6, action);
    }
  }

  // Caption length edits → prefer shorter / longer
  if (action === "edit") {
    const prev = opts?.previousCaption ?? snapshot.caption ?? "";
    const next = opts?.newCaption ?? snapshot.caption ?? "";
    if (prev && next && next.length !== prev.length) {
      if (next.length < prev.length) {
        pushSignal(signals, "caption_length", "prefer_shorter", 0.12, action);
        pushSignal(signals, "caption_length", "prefer_longer", -0.06, action);
      } else {
        pushSignal(signals, "caption_length", "prefer_longer", 0.12, action);
        pushSignal(signals, "caption_length", "prefer_shorter", -0.06, action);
      }
    }
  }

  return signals;
}

export type LearnFromFeedbackResult = {
  pageId: string | null;
  signalsApplied: number;
  weights: PreferenceWeightRow[];
  pageDnaUntouched: true;
};

/**
 * Ingest a feedback event's meaning into preference_weights.
 * Safe no-op when asset lacks a page.
 */
export async function learnFromFeedback(opts: {
  contentAssetId: string;
  action: FeedbackAction;
  previousCaption?: string | null;
  newCaption?: string | null;
  pageId?: string;
}): Promise<LearnFromFeedbackResult> {
  const snapshot = await loadAssetSnapshot(opts.contentAssetId);
  if (!snapshot) {
    return {
      pageId: null,
      signalsApplied: 0,
      weights: [],
      pageDnaUntouched: true,
    };
  }

  let pageId = opts.pageId ?? snapshot.pageId;
  if (!pageId) {
    const fallback = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
    });
    pageId = fallback?.id ?? null;
  }
  if (!pageId) {
    return {
      pageId: null,
      signalsApplied: 0,
      weights: [],
      pageDnaUntouched: true,
    };
  }

  const signals = derivePreferenceSignals(snapshot, opts.action, {
    previousCaption: opts.previousCaption,
    newCaption: opts.newCaption,
  });

  if (!signals.length) {
    return {
      pageId,
      signalsApplied: 0,
      weights: [],
      pageDnaUntouched: true,
    };
  }

  const weights = await applyPreferenceSignals({
    pageId,
    signals,
    metadata: {
      lastContentAssetId: opts.contentAssetId,
      lastAction: opts.action,
    },
  });

  return {
    pageId,
    signalsApplied: signals.length,
    weights,
    pageDnaUntouched: true,
  };
}

/**
 * Verify Page DNA row was not mutated (helper for tests / audits).
 */
export async function readPageDnaFingerprint(pageId: string): Promise<string> {
  const dna = await prisma.pageDna.findUnique({ where: { pageId } });
  if (!dna) return "missing";
  return JSON.stringify({
    topics: dna.topics,
    voice: dna.voice,
    visualMix: dna.visualMix,
    formatMix: dna.formatMix,
    weights: dna.weights,
    updatedAt: dna.updatedAt.toISOString(),
  });
}
