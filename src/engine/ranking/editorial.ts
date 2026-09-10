/**
 * Editor-in-Chief scoring + diversification (Phase 5).
 * Base rubric totals 100; Page DNA fit and diversity adjust rankScore only —
 * never inflate failing candidates into the shortlist.
 */

import type { EditorScores } from "@/agents/types";

/** Minimum total (of 100) to be eligible for shortlist. */
export const DEFAULT_EDITOR_FLOOR = 70;

export type EditorCandidateInput = {
  contentAssetId?: string;
  title: string;
  format: string;
  body?: string | null;
  hook?: string | null;
  caption?: string | null;
  imageText?: string | null;
  primaryConflict?: string | null;
  visualMetaphor?: string | null;
  endingType?: string | null;
  structure?: string | null;
  lenses?: string[];
  primaryEmotion?: string | null;
  secondaryEmotion?: string | null;
  insightStatement?: string | null;
  observation?: string | null;
  desire?: string | null;
  hiddenFear?: string | null;
  contradiction?: string | null;
  cost?: string | null;
  visualUniverse?: string | null;
  visualConcept?: string | null;
  qualityScoreHint?: number;
  metadata?: Record<string, unknown>;
};

export type PageDnaSnapshot = {
  topics?: {
    primary?: string[];
    weights?: Record<string, number>;
  };
  voice?: {
    register?: string;
    tone?: string[];
    forbidden?: string[];
    pov?: string;
  };
  visualMix?: {
    styles?: string[];
    weights?: Record<string, number>;
    motifs?: string[];
  };
  formatMix?: {
    formats?: string[];
    weights?: Record<string, number>;
  };
  weights?: {
    conflictEmphasis?: string[];
    depthBias?: string;
    noveltyFloor?: number;
  };
};

export type RecentMemoryItem = {
  contentAssetId?: string;
  primaryConflict?: string | null;
  visualMetaphor?: string | null;
  endingType?: string | null;
  hook?: string | null;
  format?: string | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fieldLen(s: string | null | undefined): number {
  return (s ?? "").trim().length;
}

function blob(c: EditorCandidateInput): string {
  return [
    c.title,
    c.body,
    c.hook,
    c.caption,
    c.imageText,
    c.insightStatement,
    c.observation,
    c.desire,
    c.hiddenFear,
    c.contradiction,
    c.cost,
    c.visualMetaphor,
    c.visualConcept,
  ]
    .filter(Boolean)
    .join("\n");
}

const GENERIC_HOOKS = [
  "believe in yourself",
  "unlock your potential",
  "embrace the journey",
  "you are enough",
  "choose yourself",
  "trust the process",
];

const SHAREABLE_MARKERS =
  /\b(you know this|we all|quietly|secretly|pretend|never say|the truth is|what nobody)\b/i;

const VISUAL_MARKERS =
  /\b(mask|mirror|ledger|thread|threshold|shadow|costume|stage|debt|window|corridor|room|scoreboard|frayed)\b/i;

/**
 * Score a candidate on the A8 100-pt rubric (fixture-deterministic heuristics).
 */
export function scoreEditorCandidate(c: EditorCandidateInput): EditorScores {
  const text = blob(c);
  const lower = text.toLowerCase();
  const statement = (c.insightStatement ?? c.title ?? "").trim();

  // Human Recognition 0–20
  let humanRecognition = 6;
  if (fieldLen(c.observation) > 40) humanRecognition += 5;
  if (fieldLen(c.observation) > 80) humanRecognition += 2;
  if (SHAREABLE_MARKERS.test(text)) humanRecognition += 3;
  if (fieldLen(c.contradiction) > 30) humanRecognition += 3;
  if (/\b(quietly|private|secret|pretend|hide)\b/i.test(text))
    humanRecognition += 2;
  humanRecognition = clamp(humanRecognition, 0, 20);

  // Original Insight 0–20
  let originalInsight = 8;
  for (const g of GENERIC_HOOKS) {
    if (lower.includes(g)) originalInsight -= 5;
  }
  if (fieldLen(c.contradiction) > 40) originalInsight += 4;
  if (fieldLen(c.cost) > 25) originalInsight += 3;
  if (c.visualMetaphor && fieldLen(c.visualMetaphor) > 12) originalInsight += 3;
  if (fieldLen(statement) > 60 && /—|:/.test(statement)) originalInsight += 2;
  // Weak / incomplete candidates
  if (!c.insightStatement && fieldLen(c.body) < 40) originalInsight -= 6;
  if (fieldLen(c.hook) < 8 && fieldLen(c.body) < 30) originalInsight -= 4;
  originalInsight = clamp(originalInsight, 0, 20);

  // Emotional Precision 0–15
  let emotionalPrecision = 3;
  if (fieldLen(c.desire) > 15) emotionalPrecision += 3;
  if (fieldLen(c.hiddenFear) > 15) emotionalPrecision += 3;
  if (c.primaryEmotion) emotionalPrecision += 2;
  if (
    c.desire &&
    c.hiddenFear &&
    c.desire.toLowerCase() !== c.hiddenFear.toLowerCase()
  ) {
    emotionalPrecision += 3;
  }
  if (c.secondaryEmotion) emotionalPrecision += 1;
  emotionalPrecision = clamp(emotionalPrecision, 0, 15);

  // Clarity 0–15
  let clarity = 5;
  const words = statement.split(/\s+/).filter(Boolean).length;
  if (words >= 6 && words <= 45) clarity += 5;
  else if (words > 45 && words <= 70) clarity += 2;
  else if (words > 0) clarity -= 1;
  if (fieldLen(c.hook) >= 12 && fieldLen(c.hook) <= 120) clarity += 3;
  if (c.format && c.format.length > 2) clarity += 1;
  if (!statement && fieldLen(c.body) < 20) clarity -= 4;
  clarity = clamp(clarity, 0, 15);

  // Shareability 0–10
  let shareability = 3;
  if (SHAREABLE_MARKERS.test(text)) shareability += 3;
  if (fieldLen(c.hook) >= 20 && fieldLen(c.hook) <= 140) shareability += 2;
  if (
    c.format === "atomic_quote" ||
    c.format === "hard_truth" ||
    c.format === "carousel"
  ) {
    shareability += 2;
  }
  if (GENERIC_HOOKS.some((g) => lower.includes(g))) shareability -= 3;
  shareability = clamp(shareability, 0, 10);

  // Visual Potential 0–10
  let visualPotential = 3;
  if (VISUAL_MARKERS.test(text)) visualPotential += 3;
  if (fieldLen(c.visualMetaphor) > 10) visualPotential += 2;
  if (c.visualUniverse || c.visualConcept) visualPotential += 2;
  if (typeof c.qualityScoreHint === "number" && c.qualityScoreHint >= 0.8) {
    visualPotential += 1;
  }
  visualPotential = clamp(visualPotential, 0, 10);

  // Evergreen Value 0–10
  let evergreenValue = 5;
  if (/\b(tiktok|covid|crypto|iphone|202[0-9]|trending)\b/i.test(text)) {
    evergreenValue -= 4;
  }
  if (fieldLen(c.cost) > 20) evergreenValue += 2;
  if (c.primaryConflict) evergreenValue += 2;
  if (fieldLen(statement) > 30) evergreenValue += 1;
  evergreenValue = clamp(evergreenValue, 0, 10);

  const total =
    humanRecognition +
    originalInsight +
    emotionalPrecision +
    clarity +
    shareability +
    visualPotential +
    evergreenValue;

  return {
    humanRecognition,
    originalInsight,
    emotionalPrecision,
    clarity,
    shareability,
    visualPotential,
    evergreenValue,
    total,
  };
}

function conflictArea(conflict?: string | null): string {
  if (!conflict) return "";
  const raw = conflict.includes("/") ? conflict.split("/")[0]! : conflict;
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

function topicMatchScore(
  conflict: string | null | undefined,
  dna: PageDnaSnapshot | null
): number {
  if (!dna || !conflict) return 0;
  const area = conflictArea(conflict).toLowerCase();
  const topics = (dna.topics?.primary ?? []).map((t) => t.toLowerCase());
  const emphasis = (dna.weights?.conflictEmphasis ?? []).map((t) =>
    t.toLowerCase()
  );
  let fit = 0;
  if (topics.some((t) => area.includes(t) || t.includes(area))) fit += 4;
  if (emphasis.some((t) => area.includes(t) || t.includes(area))) fit += 5;
  const weights = dna.topics?.weights ?? {};
  for (const [k, v] of Object.entries(weights)) {
    if (area.includes(k.toLowerCase()) || k.toLowerCase().includes(area)) {
      fit += Math.round(Number(v) * 4);
    }
  }
  return fit;
}

function formatFitScore(
  format: string,
  dna: PageDnaSnapshot | null
): number {
  if (!dna?.formatMix) return 0;
  const f = format.toLowerCase();
  const formats = (dna.formatMix.formats ?? []).map((x) => x.toLowerCase());
  const weights = dna.formatMix.weights ?? {};
  let fit = 0;
  // Map writer formats → DNA mix labels
  const aliases: Record<string, string[]> = {
    mini_reflection: ["short_essay", "thread"],
    deep_reflection: ["short_essay"],
    carousel: ["carousel"],
    short_script: ["reel_script"],
    atomic_quote: ["visual_metaphor", "thread"],
    hard_truth: ["short_essay", "thread"],
    micro_story: ["short_essay"],
    reflective_question: ["thread"],
    contradiction: ["short_essay"],
    inner_dialogue: ["short_essay", "reel_script"],
  };
  const mapped = aliases[f] ?? [f];
  for (const m of mapped) {
    if (formats.includes(m)) fit += 2;
    if (weights[m] != null) fit += Math.round(Number(weights[m]) * 6);
  }
  return fit;
}

function visualFitScore(
  c: EditorCandidateInput,
  dna: PageDnaSnapshot | null
): number {
  if (!dna?.visualMix) return 0;
  let fit = 0;
  const styles = (dna.visualMix.styles ?? []).map((s) => s.toLowerCase());
  const weights = dna.visualMix.weights ?? {};
  const universe = (c.visualUniverse ?? "").toLowerCase();
  if (universe) {
    for (const s of styles) {
      if (universe.includes(s) || s.includes(universe.replace(/_/g, ""))) {
        fit += 3;
      }
    }
    for (const [k, v] of Object.entries(weights)) {
      if (universe.includes(k.toLowerCase()) || k.toLowerCase().includes(universe)) {
        fit += Math.round(Number(v) * 5);
      }
    }
  }
  const motifs = dna.visualMix.motifs ?? [];
  const metaphor = (c.visualMetaphor ?? "").toLowerCase();
  for (const m of motifs) {
    if (metaphor.includes(m.toLowerCase()) || blob(c).toLowerCase().includes(m.toLowerCase())) {
      fit += 2;
    }
  }
  return fit;
}

function voicePenalty(c: EditorCandidateInput, dna: PageDnaSnapshot | null): number {
  if (!dna?.voice?.forbidden) return 0;
  const lower = blob(c).toLowerCase();
  let pen = 0;
  for (const f of dna.voice.forbidden) {
    if (lower.includes(f.toLowerCase())) pen += 8;
  }
  return pen;
}

export type ScoredWithRank = {
  candidate: EditorCandidateInput;
  scores: EditorScores;
  rankScore: number;
};

/**
 * Apply Page DNA fit as a bounded bonus/penalty on rankScore (not base total).
 */
export function applyPageDnaFit(
  scores: EditorScores,
  c: EditorCandidateInput,
  dna: PageDnaSnapshot | null
): ScoredWithRank {
  const topic = topicMatchScore(c.primaryConflict, dna);
  const format = formatFitScore(c.format, dna);
  const visual = visualFitScore(c, dna);
  const penalty = voicePenalty(c, dna);
  const pageDnaFit = clamp(topic + format + visual - penalty, -15, 18);
  const enriched: EditorScores = { ...scores, pageDnaFit };
  return {
    candidate: c,
    scores: enriched,
    rankScore: scores.total + pageDnaFit,
  };
}

function normalizeKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

function conflictClusterKey(conflict?: string | null): string {
  return conflictArea(conflict) || normalizeKey(conflict);
}

function metaphorKey(m?: string | null): string {
  const n = normalizeKey(m);
  if (!n) return "";
  // First 3 significant tokens
  return n.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
}

function hookKey(h?: string | null): string {
  const n = normalizeKey(h);
  if (!n) return "";
  return n.split(/\s+/).slice(0, 5).join(" ");
}

function clusterOverlap(
  a: EditorCandidateInput,
  memory: RecentMemoryItem[]
): { conflictHits: number; metaphorHits: number; hookHits: number; endingHits: number } {
  const cKey = conflictClusterKey(a.primaryConflict);
  const mKey = metaphorKey(a.visualMetaphor);
  const hKey = hookKey(a.hook);
  const eKey = normalizeKey(a.endingType);
  let conflictHits = 0;
  let metaphorHits = 0;
  let hookHits = 0;
  let endingHits = 0;
  for (const m of memory) {
    if (cKey && conflictClusterKey(m.primaryConflict) === cKey) conflictHits++;
    if (mKey && metaphorKey(m.visualMetaphor) === mKey) metaphorHits++;
    if (hKey && hookKey(m.hook) === hKey) hookHits++;
    if (eKey && normalizeKey(m.endingType) === eKey) endingHits++;
  }
  return { conflictHits, metaphorHits, hookHits, endingHits };
}

/**
 * Greedy diversification: pick highest rankScore that doesn't over-cluster
 * on conflict / metaphor / hook / ending vs recent memory + already selected.
 */
export function diversifySelect(
  selectable: ScoredWithRank[],
  opts: {
    target: number;
    recentMemory: RecentMemoryItem[];
    pageDna?: PageDnaSnapshot | null;
  }
): ScoredWithRank[] {
  const target = opts.target;
  if (target <= 0 || selectable.length === 0) return [];

  const ordered = [...selectable].sort((a, b) => b.rankScore - a.rankScore);
  const picked: ScoredWithRank[] = [];
  const pickedKeys = new Set<string>();

  const idOf = (c: EditorCandidateInput) =>
    c.contentAssetId ?? `${c.title}::${c.primaryConflict ?? ""}::${c.hook ?? ""}`;

  const effectiveScore = (
    item: ScoredWithRank,
    selected: EditorCandidateInput[]
  ): number => {
    const mem: RecentMemoryItem[] = [
      ...opts.recentMemory,
      ...selected.map((s) => ({
        primaryConflict: s.primaryConflict,
        visualMetaphor: s.visualMetaphor,
        endingType: s.endingType,
        hook: s.hook,
        format: s.format,
      })),
    ];
    const overlap = clusterOverlap(item.candidate, mem);
    const cKey = conflictClusterKey(item.candidate.primaryConflict);
    const already = selected.filter(
      (s) => conflictClusterKey(s.primaryConflict) === cKey
    ).length;

    let penalty = 0;
    // Same conflict cluster already in shortlist — strong push toward other clusters
    if (already >= 1) penalty += 30 + already * 20;
    // Recent memory saturated with this conflict
    if (overlap.conflictHits >= 2) penalty += 12;
    if (overlap.conflictHits >= 4) penalty += 10;
    // Metaphor / hook / ending — soft penalties (do not hard-exclude)
    if (overlap.metaphorHits >= 1) penalty += 14;
    // Hook match vs *selected* peers matters more than vs distant memory
    const hookVsSelected = selected.some(
      (s) =>
        hookKey(s.hook) &&
        hookKey(s.hook) === hookKey(item.candidate.hook)
    );
    if (hookVsSelected) penalty += 25;
    else if (overlap.hookHits >= 1) penalty += 6;
    if (overlap.endingHits >= 2) penalty += 5;

    return item.rankScore - penalty;
  };

  // Pass 1: greedily pick by effective score (diversity-aware)
  const remaining = [...ordered];
  while (picked.length < target && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]!;
      const selected = picked.map((p) => p.candidate);
      const score = effectiveScore(item, selected);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0]!;
    const key = idOf(chosen.candidate);
    if (pickedKeys.has(key)) continue;
    pickedKeys.add(key);
    const selected = picked.map((p) => p.candidate);
    const adj = effectiveScore(chosen, selected);
    picked.push({
      ...chosen,
      rankScore: adj,
      scores: {
        ...chosen.scores,
        diversityAdjustment: chosen.rankScore - adj,
      },
    });
  }

  return picked;
}

export function buildWhySelected(
  c: EditorCandidateInput,
  scores: EditorScores,
  ctx: {
    verdict: "best" | "alternate";
    pageDna: PageDnaSnapshot | null;
    recentMemory: RecentMemoryItem[];
    selectedSoFar: EditorCandidateInput[];
    rankIndex: number;
  }
): string {
  const parts: string[] = [];

  const topDims: Array<[string, number, number]> = [
    ["human recognition", scores.humanRecognition, 20],
    ["original insight", scores.originalInsight, 20],
    ["emotional precision", scores.emotionalPrecision, 15],
    ["clarity", scores.clarity, 15],
    ["shareability", scores.shareability, 10],
    ["visual potential", scores.visualPotential, 10],
    ["evergreen value", scores.evergreenValue, 10],
  ];
  topDims.sort((a, b) => b[1] / b[2] - a[1] / a[2]);
  const strong = topDims.filter((d) => d[1] / d[2] >= 0.65).slice(0, 3);
  if (strong.length) {
    parts.push(
      `scores high on ${strong.map((d) => d[0]).join(", ")} (total ${scores.total})`
    );
  } else {
    parts.push(`clears the editorial floor with total ${scores.total}`);
  }

  if (c.primaryConflict && c.insightStatement) {
    const area = conflictArea(c.primaryConflict);
    parts.push(
      `insight sits in ${area || c.primaryConflict} with a concrete cost/contradiction structure`
    );
  }

  if (c.visualMetaphor && fieldLen(c.visualMetaphor) > 8) {
    parts.push(`uses visual metaphor "${c.visualMetaphor.trim()}"`);
  }

  // Page DNA
  if (ctx.pageDna) {
    const topic = topicMatchScore(c.primaryConflict, ctx.pageDna);
    if (topic >= 4) {
      const emphasis = ctx.pageDna.weights?.conflictEmphasis?.join(", ");
      parts.push(
        `aligns with Page DNA topic/conflict mix${emphasis ? ` (${emphasis})` : ""}`
      );
    }
    const ff = formatFitScore(c.format, ctx.pageDna);
    if (ff >= 3) {
      parts.push(`format "${c.format}" fits the page format mix`);
    }
  }

  // Diversification vs memory / shortlist
  const mem = [
    ...ctx.recentMemory,
    ...ctx.selectedSoFar.map((s) => ({
      primaryConflict: s.primaryConflict,
      visualMetaphor: s.visualMetaphor,
      endingType: s.endingType,
      hook: s.hook,
    })),
  ];
  const overlap = clusterOverlap(c, mem);
  if (ctx.selectedSoFar.length === 0 && overlap.conflictHits === 0) {
    parts.push("differs from recent content memory on conflict cluster");
  } else if (overlap.metaphorHits === 0 && c.visualMetaphor) {
    parts.push("metaphor does not repeat recent posts");
  }
  if (ctx.rankIndex > 0) {
    const prevConflicts = ctx.selectedSoFar
      .map((s) => conflictClusterKey(s.primaryConflict))
      .filter(Boolean);
    const mine = conflictClusterKey(c.primaryConflict);
    if (mine && !prevConflicts.includes(mine)) {
      parts.push("diversifies the shortlist away from the same-conflict cluster");
    }
  }

  const role = ctx.verdict === "best" ? "Selected as best" : "Selected as alternate";
  return `${role} because ${parts.join("; ")}.`;
}
