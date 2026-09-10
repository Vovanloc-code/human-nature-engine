import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { directVisual } from "../src/agents/visual-director";
import { applyReviewAction } from "../src/engine/review";
import {
  EVIDENCE_THRESHOLD,
  applyPreferenceSignal,
  getPreferenceWeights,
  effectivePreferenceStrength,
  preferenceOverlayBoost,
  readPageDnaFingerprint,
} from "../src/engine/feedback";
import {
  ingestPerformanceMetrics,
  aggregatePerformanceByGenome,
} from "../src/analytics/performance";
import { rankPool } from "../src/agents/editor-chief";
import type { EditorCandidateInput } from "../src/engine/ranking/editorial";
import { POST as postPerfIngest } from "../src/app/api/performance/ingest/route";
import { GET as getPerfSummary } from "../src/app/api/performance/summary/route";
import { GET as getPreferences } from "../src/app/api/preferences/route";

async function makeAsset(opts: {
  label: string;
  format?: string;
  conflict?: string;
  universe?: string;
  metaphor?: string;
}) {
  const insight = await createInsight({
    statement: `TEST-P7-${opts.label}: The quieter the performance, the louder the private scoreboard.`,
    observation:
      "People track invisible rankings even when nobody is watching — then call the anxiety ambition.",
    desire: "To feel ahead without admitting the race.",
    hiddenFear: "That stopping would reveal there was never a finish line.",
    contradictoryBehavior:
      "Claiming detachment while refreshing metrics like a heartbeat.",
    cost: "A nervous system that cannot rest inside its own quiet.",
    status: "approved",
    sourceType: "test-phase7",
    primaryConflictId: opts.conflict ?? "SELF/authenticity",
  });

  const concept = await createConcept({
    insightId: insight.id,
    title: `P7 ${opts.label}`,
    angle: "performance vs presence",
    hook: "You kept score in rooms where nobody asked for a winner.",
    thesis: "Invisible scoreboards make ordinary days feel like auditions.",
    metadata: {
      format: opts.format ?? "hard_truth",
      lens: "existential",
      metaphor: opts.metaphor ?? "private scoreboard",
      structure: "recognition-twist-cost",
      ending: "open_recognition",
    },
  });

  const written = await writeContent({
    conceptId: concept.id,
    pageSlug: "the-war-within",
    format: (opts.format as "hard_truth") ?? "hard_truth",
    persist: true,
  });
  expect(written.contentAssetId).toBeTruthy();

  await directVisual({
    contentAssetId: written.contentAssetId!,
    pageSlug: "the-war-within",
    persist: true,
  });

  // Force a known visual universe for preference tests
  const universe = opts.universe ?? "symbolic_surrealism";
  const visual = await prisma.visualConcept.findFirst({
    where: { contentAssetId: written.contentAssetId! },
    orderBy: { createdAt: "desc" },
  });
  if (visual) {
    const meta = {
      ...((visual.metadata ?? {}) as Record<string, unknown>),
      universe,
    };
    await prisma.visualConcept.update({
      where: { id: visual.id },
      data: {
        style: universe,
        metaphor: opts.metaphor ?? visual.metaphor,
        metadata: meta,
      },
    });
  }

  if (opts.metaphor) {
    await prisma.contentGenome.updateMany({
      where: { contentAssetId: written.contentAssetId! },
      data: {
        visualMetaphor: opts.metaphor,
        primaryConflict: opts.conflict ?? "SELF/authenticity",
      },
    });
  } else {
    await prisma.contentGenome.updateMany({
      where: { contentAssetId: written.contentAssetId! },
      data: { primaryConflict: opts.conflict ?? "SELF/authenticity" },
    });
  }

  const page = await prisma.page.findUnique({
    where: { slug: "the-war-within" },
  });

  return {
    insightId: insight.id,
    contentAssetId: written.contentAssetId!,
    pageId: page!.id,
    universe,
  };
}

function strongCandidate(
  overrides: Partial<EditorCandidateInput> & {
    title: string;
    contentAssetId: string;
  }
): EditorCandidateInput {
  return {
    format: "hard_truth",
    hook: "You know this already: the private scoreboard never sleeps.",
    body: "When the private cost arrives, people quietly rename it as standards.",
    observation:
      "When the feeling arrives, people quietly raise a private bar so recognition cannot land.",
    desire: "To feel enough without performing the next version.",
    hiddenFear: "That rest would reveal there was never a solid self underneath.",
    contradiction:
      "Collecting proof while rewriting every proof as incomplete.",
    cost: "A life spent auditioning for a role that was never cast.",
    visualMetaphor: "private scoreboard",
    endingType: "open_recognition",
    primaryEmotion: "shame",
    secondaryEmotion: "longing",
    visualUniverse: "symbolic_surrealism",
    visualConcept: "Scoreboard lit from one side",
    structure: "recognition-twist-cost",
    primaryConflict: "SELF/authenticity",
    insightStatement:
      "The quieter the performance, the louder the private scoreboard.",
    ...overrides,
  };
}

describe("Phase 7 — Learning", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. multiple rejects of same visual universe → preference weight decreases after threshold", async () => {
    const universe = "documentary_realism";
    const page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
    });
    expect(page).toBeTruthy();

    // Clean prior weight for isolation
    await prisma.preferenceWeight.deleteMany({
      where: {
        pageId: page!.id,
        dimension: "visual_universe",
        key: universe,
      },
    });

    const assets = [];
    for (let i = 0; i < EVIDENCE_THRESHOLD; i++) {
      assets.push(
        await makeAsset({
          label: `reject-u-${i}`,
          universe,
          metaphor: `rejected motif ${i}`,
        })
      );
    }

    for (const a of assets) {
      const result = await applyReviewAction({
        contentAssetId: a.contentAssetId,
        action: "reject",
        reason: "visual-universe-off",
        notes: "phase7-reject-universe",
      });
      expect(result.ok).toBe(true);
    }

    const weights = await getPreferenceWeights({
      pageId: page!.id,
      dimension: "visual_universe",
    });
    const row = weights.find((w) => w.key === universe);
    expect(row).toBeTruthy();
    expect(row!.evidenceCount).toBeGreaterThanOrEqual(EVIDENCE_THRESHOLD);
    expect(row!.rejectCount).toBeGreaterThanOrEqual(EVIDENCE_THRESHOLD);
    expect(row!.weight).toBeLessThan(0);

    const strength = effectivePreferenceStrength(
      row!.weight,
      row!.evidenceCount,
      row!.confidence
    );
    expect(strength).toBeLessThan(0);

    // Soft overlay should penalize this universe once threshold met
    const boost = preferenceOverlayBoost(
      { visualUniverse: universe, format: "hard_truth" },
      [row!]
    );
    expect(boost).toBeLessThan(0);
  });

  it("2. approves/favorites boost dimensions without rewriting Page DNA on single action", async () => {
    const page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
      include: { dna: true },
    });
    expect(page?.dna).toBeTruthy();
    const before = await readPageDnaFingerprint(page!.id);

    const { contentAssetId, universe } = await makeAsset({
      label: "approve-once",
      universe: "fine_art_minimalism",
      format: "mini_reflection",
      conflict: "SELF/identity",
    });

    // Single approve — should create/update weights but NOT rewrite DNA
    const approved = await applyReviewAction({
      contentAssetId,
      action: "approve",
      notes: "phase7-single-approve",
    });
    expect(approved.ok).toBe(true);

    const afterApprove = await readPageDnaFingerprint(page!.id);
    expect(afterApprove).toBe(before);

    // Favorite on another asset — still no DNA rewrite
    const favAsset = await makeAsset({
      label: "favorite-once",
      universe: "fine_art_minimalism",
      format: "mini_reflection",
      conflict: "SELF/identity",
    });
    await applyReviewAction({
      contentAssetId: favAsset.contentAssetId,
      action: "favorite",
    });

    const afterFav = await readPageDnaFingerprint(page!.id);
    expect(afterFav).toBe(before);

    const weights = await getPreferenceWeights({ pageId: page!.id });
    const universeRow = weights.find(
      (w) => w.dimension === "visual_universe" && w.key === universe
    );
    const formatRow = weights.find(
      (w) => w.dimension === "format" && w.key === "mini_reflection"
    );
    expect(universeRow).toBeTruthy();
    expect(formatRow).toBeTruthy();
    // Single action: evidence < threshold → overlay strength 0
    expect(universeRow!.evidenceCount).toBeGreaterThanOrEqual(1);
    if (universeRow!.evidenceCount < EVIDENCE_THRESHOLD) {
      expect(
        effectivePreferenceStrength(
          universeRow!.weight,
          universeRow!.evidenceCount,
          universeRow!.confidence
        )
      ).toBe(0);
    }

    // DNA columns themselves unchanged
    const dna = await prisma.pageDna.findUnique({ where: { pageId: page!.id } });
    expect(JSON.stringify(dna?.visualMix)).toBe(
      JSON.stringify(page!.dna!.visualMix)
    );
    expect(JSON.stringify(dna?.formatMix)).toBe(
      JSON.stringify(page!.dna!.formatMix)
    );
  });

  it("3. performance ingest + genome-dimension aggregation", async () => {
    const a = await makeAsset({
      label: "perf-a",
      universe: "modern_cinematic",
      format: "carousel",
      conflict: "RELATIONSHIPS/intimacy",
      metaphor: "two chairs facing away",
    });
    const b = await makeAsset({
      label: "perf-b",
      universe: "typography_first",
      format: "atomic_quote",
      conflict: "SELF/authenticity",
      metaphor: "erased signature",
    });

    const ingest = await ingestPerformanceMetrics([
      { contentAssetId: a.contentAssetId, metric: "impressions", value: 2000 },
      { contentAssetId: a.contentAssetId, metric: "shares", value: 80 },
      { contentAssetId: a.contentAssetId, metric: "saves", value: 100 },
      { contentAssetId: a.contentAssetId, metric: "follows", value: 20 },
      { contentAssetId: a.contentAssetId, metric: "link_clicks", value: 40 },
      {
        contentAssetId: a.contentAssetId,
        metric: "meaningful_comments",
        value: 15,
      },
      { contentAssetId: a.contentAssetId, metric: "likes", value: 200 },
      { contentAssetId: b.contentAssetId, metric: "impressions", value: 2000 },
      { contentAssetId: b.contentAssetId, metric: "shares", value: 10 },
      { contentAssetId: b.contentAssetId, metric: "saves", value: 8 },
      { contentAssetId: b.contentAssetId, metric: "follows", value: 1 },
      { contentAssetId: b.contentAssetId, metric: "link_clicks", value: 2 },
      {
        contentAssetId: b.contentAssetId,
        metric: "meaningful_comments",
        value: 1,
      },
      { contentAssetId: b.contentAssetId, metric: "likes", value: 500 }, // likes alone must not win
    ]);
    expect(ingest.inserted).toBe(14);

    const agg = await aggregatePerformanceByGenome({ pageId: a.pageId });
    expect(agg.byConflict.length).toBeGreaterThanOrEqual(1);
    expect(agg.byVisual.length).toBeGreaterThanOrEqual(1);
    expect(agg.byFormat.length).toBeGreaterThanOrEqual(1);

    const intimacy = agg.byConflict.find((c) =>
      c.key.includes("RELATIONSHIPS/intimacy")
    );
    const authenticity = agg.byConflict.find((c) =>
      c.key.includes("SELF/authenticity")
    );
    expect(intimacy).toBeTruthy();
    expect(authenticity).toBeTruthy();
    // Primary score uses share/save/follow/meaningful/link — not likes
    expect(intimacy!.primaryScore).toBeGreaterThan(authenticity!.primaryScore);
    expect(intimacy!.shareRate).toBeGreaterThan(authenticity!.shareRate!);

    // Thin API
    const apiIngest = await postPerfIngest(
      new NextRequest("http://localhost/api/performance/ingest", {
        method: "POST",
        body: JSON.stringify({
          contentAssetId: a.contentAssetId,
          metric: "dwell_time",
          value: 22,
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(apiIngest.status).toBe(200);
    const apiBody = await apiIngest.json();
    expect(apiBody.ok).toBe(true);

    const summaryRes = await getPerfSummary(
      new NextRequest(
        "http://localhost/api/performance/summary?page=the-war-within"
      )
    );
    expect(summaryRes.status).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.ok).toBe(true);
    expect(summary.performance.byConflict).toBeDefined();
    expect(summary.preferences.threshold).toBe(EVIDENCE_THRESHOLD);
  });

  it("4. ranking soft-boost uses preferences when evidence sufficient", async () => {
    const page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
    });
    expect(page).toBeTruthy();

    const likedUniverse = "renaissance_chiaroscuro";
    const dislikedUniverse = "typography_first";

    await prisma.preferenceWeight.deleteMany({
      where: {
        pageId: page!.id,
        dimension: "visual_universe",
        key: { in: [likedUniverse, dislikedUniverse] },
      },
    });

    // Seed sufficient evidence without going through full review for speed
    for (let i = 0; i < EVIDENCE_THRESHOLD; i++) {
      await applyPreferenceSignal({
        pageId: page!.id,
        signal: {
          dimension: "visual_universe",
          key: likedUniverse,
          delta: 0.14,
          action: "approve",
        },
      });
      await applyPreferenceSignal({
        pageId: page!.id,
        signal: {
          dimension: "visual_universe",
          key: dislikedUniverse,
          delta: -0.14,
          action: "reject",
        },
      });
    }

    const prefs = await getPreferenceWeights({ pageId: page!.id });
    const liked = prefs.find((w) => w.key === likedUniverse)!;
    const disliked = prefs.find((w) => w.key === dislikedUniverse)!;
    expect(liked.evidenceCount).toBeGreaterThanOrEqual(EVIDENCE_THRESHOLD);
    expect(disliked.evidenceCount).toBeGreaterThanOrEqual(EVIDENCE_THRESHOLD);
    expect(liked.weight).toBeGreaterThan(0);
    expect(disliked.weight).toBeLessThan(0);

    const candidates: EditorCandidateInput[] = [
      strongCandidate({
        title: "Liked universe candidate",
        contentAssetId: "p7-liked",
        visualUniverse: likedUniverse,
        primaryConflict: "SELF/ego",
      }),
      strongCandidate({
        title: "Disliked universe candidate",
        contentAssetId: "p7-disliked",
        visualUniverse: dislikedUniverse,
        primaryConflict: "SELF/ego",
        hook: "You know this already: the private scoreboard never sleeps quietly.",
      }),
    ];

    // Isolate universe prefs so other dimensions from prior tests do not contaminate
    const isolatedPrefs = [liked, disliked];

    const without = rankPool({
      candidates,
      target: 2,
      floor: 50,
      learningOverlay: null,
    });
    const withLearning = rankPool({
      candidates,
      target: 2,
      floor: 50,
      learningOverlay: { preferences: isolatedPrefs },
    });

    const likedWithout = without.scored.find(
      (s) => s.contentAssetId === "p7-liked"
    )!;
    const dislikedWithout = without.scored.find(
      (s) => s.contentAssetId === "p7-disliked"
    )!;
    const likedWith = withLearning.scored.find(
      (s) => s.contentAssetId === "p7-liked"
    )!;
    const dislikedWith = withLearning.scored.find(
      (s) => s.contentAssetId === "p7-disliked"
    )!;

    // Base QC totals unchanged by learning overlay
    expect(likedWith.scores.total).toBe(likedWithout.scores.total);
    expect(dislikedWith.scores.total).toBe(dislikedWithout.scores.total);

    // Soft boost: liked universe rises relative to disliked
    const deltaWithout = likedWithout.rankScore - dislikedWithout.rankScore;
    const deltaWith = likedWith.rankScore - dislikedWith.rankScore;
    expect(deltaWith).toBeGreaterThan(deltaWithout);
    expect(likedWith.scores.preferenceBoost ?? 0).toBeGreaterThan(0);
    expect(dislikedWith.scores.preferenceBoost ?? 0).toBeLessThan(0);

    // Below-threshold evidence must not boost
    const weakPrefs = [
      { ...liked, evidenceCount: EVIDENCE_THRESHOLD - 1 },
    ];
    const mid = rankPool({
      candidates: [
        strongCandidate({
          title: "Weak evidence",
          contentAssetId: "p7-weak",
          visualUniverse: likedUniverse,
        }),
      ],
      target: 1,
      floor: 50,
      learningOverlay: { preferences: weakPrefs },
    });
    expect(mid.scored[0]!.scores.preferenceBoost ?? 0).toBe(0);

    const prefApi = await getPreferences(
      new NextRequest("http://localhost/api/preferences?page=the-war-within")
    );
    expect(prefApi.status).toBe(200);
    const prefBody = await prefApi.json();
    expect(prefBody.ok).toBe(true);
    expect(prefBody.threshold).toBe(EVIDENCE_THRESHOLD);
    expect(prefBody.weights.length).toBeGreaterThan(0);
  });
});
