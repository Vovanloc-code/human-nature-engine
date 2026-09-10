/** Phase 1 scoring helpers — composite from stored scores. */
export function compositeInsightScore(scores: {
  universalityScore?: number | null;
  depthScore?: number | null;
  noveltyScore?: number | null;
  recognitionScore?: number | null;
}): number {
  const u = scores.universalityScore ?? 0;
  const d = scores.depthScore ?? 0;
  const n = scores.noveltyScore ?? 0;
  const r = scores.recognitionScore ?? 0;
  return (u * 0.3 + d * 0.3 + n * 0.2 + r * 0.2);
}
