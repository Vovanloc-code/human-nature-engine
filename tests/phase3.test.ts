import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { architectConcepts } from "../src/agents/concept-architect";
import {
  writeContent,
  containsBannedSlop,
  WRITER_BANNED_PHRASES,
  mapConceptFormatToWriterFormat,
} from "../src/agents/writer";
import {
  directVisual,
  assertVisualDirection,
  REQUIRED_VISUAL_FIELDS,
  motifsToAvoid,
} from "../src/agents/visual-director";
import { runProductionPipeline } from "../src/engine/production/pipeline";
import { runDiscoveryPipeline } from "../src/engine/discovery/pipeline";
import { seedPhase3Prompts, getPromptVersion } from "../src/prompts";
import { scoreInsight } from "../src/agents/insight-critic";
import type { InsightCandidate } from "../src/agents/types";

describe("Phase 3 — Production", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
    await seedPhase3Prompts();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. Writer produces draft fields for a concept without banned slop phrases", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P3-W: Self-worth postponed until the next achievement is a debt that compounds interest in shame.",
      observation:
        "When praise arrives, people quietly raise the bar so the feeling cannot land.",
      desire: "To finally feel enough without performing more.",
      hiddenFear:
        "That rest would reveal there was never a solid self underneath the effort.",
      contradictoryBehavior:
        "Collecting compliments while rewriting them as incomplete.",
      cost: "A life spent auditioning for a role that was never cast.",
      status: "approved",
      sourceType: "test",
      primaryConflictId: "SELF/identity",
    });

    const concept = await createConcept({
      insightId: insight.id,
      title: "The Debt Ledger of Self-Worth",
      angle: "private cost of public competence",
      hook: "You know this already: praise arrives and somehow never lands.",
      thesis: "Postponed enoughness compounds into shame.",
      metadata: {
        format: "hard_truth",
        lens: "modern-psychology",
        metaphor: "debt ledger of self-worth",
        structure: "recognition-twist-cost",
        ending: "open_recognition",
        audience: "overachievers",
        domain: "identity",
      },
    });

    const result = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "hard_truth",
      persist: false,
    });

    expect(result.provider).toBe("fixture");
    expect(result.draft.format).toBe("hard_truth");
    expect(result.draft.headline?.length).toBeGreaterThan(3);
    expect(result.draft.hook?.length).toBeGreaterThan(10);
    expect(result.draft.image_text?.length).toBeGreaterThan(5);
    expect(result.draft.caption?.length).toBeGreaterThan(20);
    expect(result.draft.cta?.length).toBeGreaterThan(5);

    const blob = [
      result.draft.headline,
      result.draft.hook,
      result.draft.image_text,
      result.draft.caption,
      result.draft.cta,
      ...(result.draft.alternate_hooks ?? []),
    ]
      .join("\n")
      .toLowerCase();

    for (const phrase of WRITER_BANNED_PHRASES) {
      expect(blob).not.toContain(phrase);
    }
    expect(containsBannedSlop(blob)).toBeNull();
    expect(mapConceptFormatToWriterFormat("carousel")).toBe("carousel");
    expect(mapConceptFormatToWriterFormat("reel_script")).toBe("short_script");
  });

  it("2. content_asset created with linked genome", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P3-G: The need to be right often costs more intimacy than being wrong ever would.",
      observation:
        "Winning an argument feels like oxygen — until the room empties.",
      desire: "To be seen as right, and therefore safe.",
      hiddenFear: "Being ordinary, wrong, or replaceable.",
      contradictoryBehavior:
        "Demanding humility from others while treating correction as attack.",
      cost: "Loneliness dressed as principle.",
      status: "approved",
      sourceType: "test",
      primaryConflictId: "EGO/need-to-be-right",
    });

    const concept = await createConcept({
      insightId: insight.id,
      title: "Expensive Victory",
      angle: "ambition as fear of ordinariness",
      hook: "Being right can empty a room.",
      thesis: "Ego trades intimacy for the feeling of safety.",
      metadata: {
        format: "mini_reflection",
        lens: "stoic",
        metaphor: "room with two chairs and one exit",
        structure: "scene-confession-reframe",
        ending: "cost_named",
      },
    });

    const result = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "mini_reflection",
      persist: true,
    });

    expect(result.contentAssetId).toBeTruthy();
    expect(result.genomeId).toBeTruthy();

    const asset = await prisma.contentAsset.findUnique({
      where: { id: result.contentAssetId! },
      include: { genome: true },
    });
    expect(asset).toBeTruthy();
    expect(asset!.conceptId).toBe(concept.id);
    expect(asset!.pageId).toBeTruthy();
    expect(asset!.status).toBe("draft");
    expect(asset!.format).toBe("mini_reflection");
    expect(asset!.genome).toBeTruthy();
    expect(asset!.genome!.id).toBe(result.genomeId);

    const meta = asset!.metadata as Record<string, unknown>;
    expect(meta.platform).toBeTruthy();
    expect(meta.headline).toBeTruthy();
    expect(meta.language).toBe("en");
    expect(typeof meta.quality_score).toBe("number");
  });

  it("3. Visual director produces visual concept with required fields and generation prompt", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P3-V: Attachment panic often destroys the relationship it is trying to save.",
      observation:
        "Clinging intensifies the moment someone pulls away.",
      desire: "Permanent belonging.",
      hiddenFear: "Abandonment proving we were never chosen.",
      contradictoryBehavior: "Smothering the bond to prevent its ending.",
      cost: "Pushing away the person we meant to keep.",
      status: "approved",
      sourceType: "test",
      primaryConflictId: "ATTACHMENT/people",
    });

    const concept = await createConcept({
      insightId: insight.id,
      title: "Grip That Breaks",
      angle: "how love becomes control",
      hook: "The harder you hold, the less it feels like love.",
      thesis: "Panic grip is not devotion.",
      metadata: {
        format: "micro_story",
        lens: "existential",
        metaphor: "thread pulled until the sweater vanishes",
        structure: "mirror-metaphor-release",
        ending: "soft_absolution",
      },
    });

    const written = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "micro_story",
      persist: true,
    });

    const visual = await directVisual({
      contentAssetId: written.contentAssetId!,
      pageSlug: "the-war-within",
      persist: true,
      // Simulate history that already used lonely-window
      visualHistory: [
        {
          universe: "documentary_realism",
          motif: "lonely-window",
          subject: "person staring out rainy window",
        },
      ],
    });

    expect(visual.provider).toBe("fixture");
    assertVisualDirection(visual.direction);
    for (const field of REQUIRED_VISUAL_FIELDS) {
      expect(visual.direction[field]).toBeTruthy();
    }
    expect(visual.direction.generation_prompt.length).toBeGreaterThan(20);
    expect(visual.direction.negative_constraints.length).toBeGreaterThan(0);
    expect(visual.visualConceptId).toBeTruthy();

    const blob = `${visual.direction.visual_concept} ${visual.direction.subject} ${visual.direction.generation_prompt}`.toLowerCase();
    expect(blob).not.toMatch(/lonely.?window/);
    expect(motifsToAvoid([{ motif: "lonely-window" }])).toContain("lonely-window");

    const vc = await prisma.visualConcept.findUnique({
      where: { id: visual.visualConceptId! },
      include: { visualAssets: true },
    });
    expect(vc?.contentAssetId).toBe(written.contentAssetId);
    expect(vc?.metadata).toBeTruthy();
    const vmeta = vc!.metadata as Record<string, unknown>;
    expect(vmeta.generation_prompt).toBeTruthy();
    expect(vc!.visualAssets.length).toBeGreaterThanOrEqual(1);
  });

  it("4. End-to-end: Insight → Critic path concept → Writer → Visual", async () => {
    const strong: InsightCandidate = {
      observation:
        "People prolong arguments past the point of clarity because surrender feels like erasure.",
      desire: "To remain undefeated in the story of the self.",
      hidden_fear: "Being rewritten by someone else's version of events.",
      contradiction:
        "Demanding honesty while punishing the honest correction.",
      cost: "A quiet house and a loud inner courtroom.",
      statement:
        "TEST-P3-E2E: Ego trades peace for being right, then calls the loneliness integrity.",
    };

    const critique = scoreInsight(strong);
    expect(critique.approved).toBe(true);

    const insight = await createInsight({
      statement: strong.statement,
      observation: strong.observation,
      desire: strong.desire,
      hiddenFear: strong.hidden_fear,
      contradictoryBehavior: strong.contradiction,
      cost: strong.cost,
      status: "approved",
      sourceType: "test",
      primaryConflictId: "EGO/pride",
      recognitionScore: critique.scores.humanRecognition / 20,
      noveltyScore: critique.scores.originality / 20,
      depthScore: critique.scores.emotionalPrecision / 15,
      metadata: { critic: critique },
    });

    const arch = await architectConcepts({
      insightId: insight.id,
      count: 3,
      persist: true,
    });
    expect(arch.concepts.length).toBeGreaterThanOrEqual(1);
    expect(arch.persistedIds.length).toBeGreaterThanOrEqual(1);

    const produced = await runProductionPipeline({
      conceptId: arch.persistedIds[0],
      pageSlug: "the-war-within",
      format: "carousel",
      persist: true,
    });

    expect(produced.runId).toMatch(/^RUN-\d{4}-\d{2}-\d{2}-\d{3}$/);
    expect(produced.draft.format).toBe("carousel");
    expect(produced.draft.carousel_slides?.length).toBeGreaterThanOrEqual(3);
    expect(produced.contentAssetId).toBeTruthy();
    expect(produced.genomeId).toBeTruthy();
    expect(produced.visualConceptId).toBeTruthy();
    expect(produced.direction.generation_prompt.length).toBeGreaterThan(20);

    const run = await prisma.agentRun.findUnique({
      where: { runId: produced.runId },
      include: { logs: true },
    });
    expect(run?.status).toBe("succeeded");
    expect(run!.logs.length).toBeGreaterThan(0);

    // Prompt versions seeded for writer + visual-director
    const writerPrompt = await getPromptVersion("writer", "1.0");
    const visualPrompt = await getPromptVersion("visual-director", "1.0");
    expect(writerPrompt?.body).toContain("Writer");
    expect(visualPrompt?.body).toContain("Visual Director");

    // Also smoke the discover --produce path lightly
    const pipe = await runDiscoveryPipeline({
      taxonomyArea: "SELF",
      count: 5,
      persistInsights: true,
      buildConcepts: true,
      persistConcepts: true,
      conceptCount: 2,
      produceContent: true,
      pageSlug: "the-war-within",
    });
    expect(pipe.production?.contentAssetId).toBeTruthy();
    expect(pipe.production?.visualConceptId).toBeTruthy();
  });
});
