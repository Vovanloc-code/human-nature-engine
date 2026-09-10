/** Vector / similarity math helpers for Phase 4 dedup. */

export function l2Normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (!norm || !Number.isFinite(norm)) {
    return values.map(() => 0);
  }
  return values.map((v) => v / norm);
}

/** Cosine similarity for L2-normalized (or raw) vectors, clamped to [0, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  if (!Number.isFinite(sim)) return 0;
  return clamp01(sim);
}

/** Jaccard over token sets. */
export function jaccardTokens(a: string, b: string): number {
  const ta = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
  );
  const tb = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
  );
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function equalityScore(a?: string | null, b?: string | null): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (na === nb) return 1;
  return jaccardTokens(na, nb);
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function weightedMean(
  parts: Array<{ weight: number; score: number }>
): number {
  let w = 0;
  let s = 0;
  for (const p of parts) {
    if (p.weight <= 0) continue;
    w += p.weight;
    s += p.weight * p.score;
  }
  if (w === 0) return 0;
  return clamp01(s / w);
}
