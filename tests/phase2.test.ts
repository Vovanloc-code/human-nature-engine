import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { runSlopCritic, critiqueText } from "../src/agents/slop-critic";
import { scoreInsight } from "../src/agents/insight-critic";
import { scoutInsights } from "../src/agents/insight-scout";
import { architectConcepts } from "../src/agents/concept-architect";
import { runDiscoveryPipeline } from "../src/engine/discovery/pipeline";
import { createInsight } from "../src/engine/discovery/insights";
import { seedPhase2Prompts, ensurePromptVersion, getPromptVersion } from "../src/prompts";
import { PHILOSOPHICAL_LENSES, applyLensFraming } from "../src/lenses";
import { getProvider, resolveProviderMode } from "../src/providers";
import type { InsightCandidate } from "../src/agents/types";

describe("Phase 2 — Intelligence", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
    await seedPhase2Prompts();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. slop critic rejects generic motivation slogans", () => {
    for (const line of [
      "Believe in yourself.",
      "Everything happens for a reason.",
      "Embrace your journey.",
    ]) {
      const result = runSlopCritic({ text: line });
      expect(result.pass).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      const codes = result.violations.map((v) => v.code);
      expect(
        codes.some((c) =>
          [
            "GENERIC_MOTIVATION",
            "EMPTY_PROFUNDITY",
            "NO_SPECIFIC_HUMAN_TRUTH",
            "WEAK_INSIGHT",
          ].includes(c)
        )
      ).toBe(true);
      expect(result.rewrite_instruction).toBeTruthy();
    }
  });

  it("2. fabricated quotations / FALSE_ATTRIBUTION fail", () => {
    const fakes = [
      'As Einstein once said, "Imagination is more important than knowledge about your hustle."',
      '"The unexamined brand is not worth living." — Socrates',
      "According to Marcus Aurelius, you should just vibe higher.",
      'Buddha said: "Believe in yourself and embrace your journey."',
    ];
    for (const text of fakes) {
      const result = critiqueText(text);
      expect(result.pass).toBe(false);
      expect(result.violations.some((v) => v.code === "FALSE_ATTRIBUTION")).toBe(
        true
      );
    }
  });

  it("3. scout produces candidates with required fields (fixture mode)", async () => {
    const mode = resolveProviderMode("fixture");
    expect(mode.mode).toBe("fixture");
    expect(getProvider("fixture").name).toBe("fixture");

    const { candidates, provider } = await scoutInsights({
      taxonomyArea: "SELF",
      count: 8,
      pageSlug: "the-war-within",
    });

    expect(provider).toBe("fixture");
    expect(candidates.length).toBeGreaterThanOrEqual(5);
    expect(candidates.length).toBeLessThanOrEqual(30);

    for (const c of candidates) {
      expect(c.observation?.length).toBeGreaterThan(10);
      expect(c.desire?.length).toBeGreaterThan(5);
      expect(c.hidden_fear?.length).toBeGreaterThan(5);
      expect((c.contradiction ?? c.contradictory_behavior)?.length).toBeGreaterThan(5);
      expect(c.cost?.length).toBeGreaterThan(5);
      expect(c.statement?.length).toBeGreaterThan(10);
      expect(c.statement.toLowerCase()).not.toContain("believe in yourself");
      expect(c.statement.toLowerCase()).not.toContain("people should love themselves");
    }
  });

  it("4. critic scores and rejects weak / passes strong fixture insights", () => {
    const weak = scoreInsight({
      statement: "Believe in yourself.",
      observation: "x",
      desire: "y",
      hidden_fear: "z",
      contradiction: "w",
      cost: "c",
    });
    expect(weak.approved).toBe(false);
    expect(weak.band).toBe("reject");
    expect(weak.scores.total).toBeLessThan(65);

    const strong: InsightCandidate = {
      observation:
        "When praise arrives, people quietly raise the bar so the feeling cannot land — then call it standards.",
      desire: "To finally feel enough without performing more.",
      hidden_fear:
        "That rest would reveal there was never a solid self underneath the effort.",
      contradiction:
        "Collecting compliments while rewriting them as incomplete; asking for reassurance then distrusting it.",
      cost: "A life spent auditioning for a role that was never cast — a private mask in every room.",
      statement:
        "Self-worth postponed until the next achievement is a debt that compounds interest in shame.",
    };
    const good = scoreInsight(strong);
    expect(good.scores.total).toBeGreaterThanOrEqual(75);
    expect(good.approved).toBe(true);
    expect(["usable", "strong", "exceptional"]).toContain(good.band);
    expect(good.scores.humanRecognition).toBeLessThanOrEqual(20);
    expect(good.scores.originality).toBeLessThanOrEqual(20);
    expect(good.scores.emotionalPrecision).toBeLessThanOrEqual(15);
    expect(good.scores.clarity).toBeLessThanOrEqual(15);
    expect(good.scores.evergreenValue).toBeLessThanOrEqual(10);
    expect(good.scores.expansionPotential).toBeLessThanOrEqual(10);
    expect(good.scores.visualPotential).toBeLessThanOrEqual(10);
  });

  it("5. integration: Insight → Critic → Concept (at least one concept)", async () => {
    const pipeline = await runDiscoveryPipeline({
      taxonomyArea: "EGO",
      count: 6,
      persistInsights: true,
      buildConcepts: true,
      conceptCount: 4,
      persistConcepts: true,
      pageSlug: "the-war-within",
    });

    expect(pipeline.runId).toMatch(/^RUN-\d{4}-\d{2}-\d{2}-\d{3}$/);
    expect(pipeline.candidates.length).toBeGreaterThanOrEqual(5);
    expect(pipeline.approved.length).toBeGreaterThanOrEqual(1);
    expect(pipeline.concepts.length).toBeGreaterThanOrEqual(1);
    expect(pipeline.conceptInsightId).toBeTruthy();

    const run = await prisma.agentRun.findUnique({
      where: { runId: pipeline.runId },
      include: { logs: true },
    });
    expect(run?.status).toBe("succeeded");
    expect(run!.logs.length).toBeGreaterThan(0);

    // Diversity: concepts should not all share the same angle+format+lens
    const keys = new Set(
      pipeline.concepts.map(
        (c) => `${c.angle}|${c.format}|${c.lens}|${c.metaphor}`
      )
    );
    expect(keys.size).toBeGreaterThanOrEqual(Math.min(3, pipeline.concepts.length));

    // Direct architect path also works on an approved insight
    const insight = await createInsight({
      statement:
        "TEST-P2: Ego trades peace for being right, then calls the loneliness integrity.",
      observation:
        "People prolong arguments past the point of clarity because surrender feels like erasure.",
      desire: "To remain undefeated in the story of the self.",
      hiddenFear: "Being rewritten by someone else's version of events.",
      contradictoryBehavior:
        "Demanding honesty while punishing the honest correction.",
      cost: "A quiet house and a loud inner courtroom.",
      status: "approved",
      sourceType: "test",
    });
    const arch = await architectConcepts({
      insightId: insight.id,
      count: 3,
      persist: false,
    });
    expect(arch.concepts.length).toBeGreaterThanOrEqual(1);
  });

  it("6. prompt versioning does not silently overwrite + lenses exist", async () => {
    const first = await ensurePromptVersion({
      agent: "insight-scout",
      version: "1.0",
      body: "ORIGINAL BODY SHOULD STAY",
      activate: true,
    });
    // Already seeded with real body — ensure does not overwrite
    expect(first.created).toBe(false);
    const row = await getPromptVersion("insight-scout", "1.0");
    expect(row?.body).toBeTruthy();
    expect(row!.body).not.toBe("ORIGINAL BODY SHOULD STAY");
    expect(row!.body).toContain("Insight Scout");

    // New version can be added without touching 1.0
    const unique = `1.1-test-${Date.now()}`;
    const v11 = await ensurePromptVersion({
      agent: "insight-scout",
      version: unique,
      body: "Scout v1.1 test body",
      activate: false,
    });
    expect(v11.created).toBe(true);
    // Re-ensure same version must NOT overwrite / re-create
    const again = await ensurePromptVersion({
      agent: "insight-scout",
      version: unique,
      body: "SHOULD NOT REPLACE",
      activate: false,
    });
    expect(again.created).toBe(false);
    const kept = await getPromptVersion("insight-scout", unique);
    expect(kept!.body).toBe("Scout v1.1 test body");
    const still = await getPromptVersion("insight-scout", "1.0");
    expect(still!.body).toContain("Insight Scout");

    expect(PHILOSOPHICAL_LENSES.length).toBe(9);
    const framed = applyLensFraming("stoic", "We defend our self-image fiercely.");
    expect(framed.framedGuidance).toContain("Stoic");
    expect(framed.framedGuidance.toLowerCase()).toContain("do not invent");
  });
});
