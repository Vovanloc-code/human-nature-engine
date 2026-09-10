import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { createContentAsset, linkGenome } from "../src/engine/generation";
import { recordFeedback } from "../src/engine/feedback";
import { getIdeaVaultMetrics } from "../src/engine/idea-vault";
import { countTaxonomy } from "../src/engine/taxonomy";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  getRunByRunId,
  appendRunLog,
} from "../src/engine/runs";

describe("Phase 1 — Human Nature Content Engine", () => {
  beforeAll(async () => {
    // Ensure DB is reachable
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. create insight", async () => {
    const insight = await createInsight({
      statement:
        "TEST: People confuse being busy with being necessary — then panic when the busy stops.",
      observation: "Busyness as identity proof.",
      desire: "To matter without pausing.",
      hiddenFear: "Irrelevance in stillness.",
      contradictoryBehavior: "Scheduling rest then filling it.",
      cost: "Burnout as identity crisis.",
      primaryConflictId: "SELF/identity",
      secondaryConflicts: ["SOCIETY/work"],
      universalityScore: 0.8,
      depthScore: 0.75,
      noveltyScore: 0.6,
      recognitionScore: 0.8,
      status: "candidate",
      sourceType: "test",
      metadata: { emotions: ["anxiety"], lenses: ["psychological"] },
    });

    expect(insight.id).toBeTruthy();
    expect(insight.statement).toContain("TEST:");
    expect(insight.status).toBe("candidate");
  });

  it("2. create concept linked to insight", async () => {
    const insight = await createInsight({
      statement: "TEST-CONCEPT-PARENT: Control is a counterfeit of intimacy.",
      status: "approved",
      primaryConflictId: "ATTACHMENT/people",
    });

    const concept = await createConcept({
      insightId: insight.id,
      title: "The Counterfeit of Control",
      angle: "attachment vs intimacy",
      hook: "You thought you were protecting the bond.",
      thesis: "Control masquerades as care when fear runs the relationship.",
    });

    expect(concept.insightId).toBe(insight.id);
    expect(concept.title).toBe("The Counterfeit of Control");

    const linked = await prisma.concept.findUnique({
      where: { id: concept.id },
      include: { insight: true },
    });
    expect(linked?.insight.statement).toContain("TEST-CONCEPT-PARENT");
  });

  it("3. create content asset", async () => {
    const insight = await createInsight({
      statement: "TEST-ASSET-PARENT: Shame paints the person, not the act.",
      status: "approved",
    });
    const concept = await createConcept({
      insightId: insight.id,
      title: "Shame vs Guilt",
    });
    const page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
    });

    const asset = await createContentAsset({
      conceptId: concept.id,
      pageId: page?.id,
      title: "When Shame Becomes Identity",
      format: "short_essay",
      body: "Guilt says you did wrong. Shame says you are wrong...",
      status: "draft",
    });

    expect(asset.conceptId).toBe(concept.id);
    expect(asset.format).toBe("short_essay");
  });

  it("4. link genome", async () => {
    const insight = await createInsight({
      statement: "TEST-GENOME-PARENT: Ego trades peace for being right.",
      status: "approved",
    });
    const concept = await createConcept({
      insightId: insight.id,
      title: "Peace vs Rightness",
    });
    const asset = await createContentAsset({
      conceptId: concept.id,
      title: "The Expensive Victory",
      format: "carousel",
    });

    const genome = await linkGenome({
      contentAssetId: asset.id,
      primaryConflict: "EGO/need-to-be-right",
      secondaryConflicts: ["RELATIONSHIPS/boundaries"],
      primaryEmotion: "pride",
      secondaryEmotion: "loneliness",
      audienceWounds: ["being dismissed", "losing face"],
      lenses: ["stoic", "psychological"],
      tones: ["direct", "unsentimental"],
      depthLevel: "deep",
      structure: "recognition-twist-cost",
      visualMetaphor: "renaissance_chiaroscuro duel of selves",
      endingType: "open_recognition",
    });

    expect(genome.contentAssetId).toBe(asset.id);
    expect(genome.primaryConflict).toBe("EGO/need-to-be-right");
    expect(genome.visualMetaphor).toContain("chiaroscuro");
  });

  it("5. record feedback", async () => {
    const insight = await createInsight({
      statement: "TEST-FEEDBACK-PARENT: Feedback is a compass, not a verdict.",
      status: "candidate",
    });

    const event = await recordFeedback({
      objectType: "human_insight",
      objectId: insight.id,
      action: "approve",
      reason: "high recognition",
      notes: "Phase 1 test feedback",
      insightId: insight.id,
    });

    expect(event.action).toBe("approve");
    expect(event.objectId).toBe(insight.id);

    await prisma.humanInsight.update({
      where: { id: insight.id },
      data: { status: "approved" },
    });
  });

  it("6. taxonomy seeded", async () => {
    const { categories, nodes } = await countTaxonomy();
    expect(categories).toBe(10);
    expect(nodes).toBeGreaterThanOrEqual(70);

    const self = await prisma.taxonomyCategory.findUnique({
      where: { slug: "SELF" },
      include: { nodes: true },
    });
    expect(self).toBeTruthy();
    expect(self!.nodes.map((n) => n.slug)).toContain("shame");

    const society = await prisma.taxonomyCategory.findUnique({
      where: { slug: "SOCIETY" },
      include: { nodes: true },
    });
    expect(society!.nodes.map((n) => n.slug)).toContain("status-signaling");
  });

  it("7. idea vault metrics", async () => {
    const metrics = await getIdeaVaultMetrics();
    expect(metrics.total).toBeGreaterThanOrEqual(100);
    expect(metrics.approved).toBeGreaterThan(50);
    expect(metrics.exceptional).toBeGreaterThan(0);
    expect(typeof metrics.unused).toBe("number");
    expect(typeof metrics.used).toBe("number");
    expect(typeof metrics.needs_research).toBe("number");
    expect(typeof metrics.rejected).toBe("number");
    expect(typeof metrics.retired).toBe("number");
  });

  it("8. run logging", async () => {
    const runId = await allocateRunId();
    expect(runId).toMatch(/^RUN-\d{4}-\d{2}-\d{2}-\d{3}$/);

    const run = await startAgentRun({
      agent: "insight-scout",
      runId,
      input: { phase: 1, test: true },
    });
    expect(run.runId).toBe(runId);
    expect(run.status).toBe("running");

    await appendRunLog(run.id, "info", "Scout scanned seed vault", {
      count: 101,
    });

    await finishAgentRun(run.id, "succeeded", { found: 0 });

    const loaded = await getRunByRunId(runId);
    expect(loaded).toBeTruthy();
    expect(loaded!.status).toBe("succeeded");
    expect(loaded!.logs.length).toBeGreaterThanOrEqual(2);
    expect(loaded!.logs.some((l) => l.message.includes("Scout"))).toBe(true);

    const nextId = await allocateRunId();
    const seq = Number(runId.slice(-3));
    const nextSeq = Number(nextId.slice(-3));
    expect(nextSeq).toBe(seq + 1);
  });
});
