import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { directVisual } from "../src/agents/visual-director";
import {
  judgeDuplicates,
  judgeInsightPair,
} from "../src/agents/dedup-judge";
import {
  embedInsightRecord,
  embedConceptRecord,
  embedContentAssetRecord,
  embedVisualConceptRecord,
  getEmbedding,
  searchSimilarInsights,
  searchSimilarConcepts,
  embedTexts,
} from "../src/engine/embeddings";
import {
  genomeSimilarity,
  judgeFromSimilarities,
  vectorSimilarity,
  DEFAULT_DEDUP_THRESHOLDS,
} from "../src/engine/dedup";
import { seedPhase4Prompts, getPromptVersion } from "../src/prompts";
import { runProductionPipeline } from "../src/engine/production/pipeline";

describe("Phase 4 — Memory / Dedup", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
    await seedPhase4Prompts();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. Known duplicate paraphrase pairs → hard_duplicate or rewrite_zone", async () => {
    // Same core truth, different wording — carefully crafted shared stems
    const a = await createInsight({
      statement:
        "Self-worth postponed until the next achievement is a debt that compounds interest in shame.",
      observation:
        "When praise arrives, people quietly raise the bar so the feeling cannot land — then call it standards.",
      desire: "To finally feel enough without performing more.",
      hiddenFear:
        "That rest would reveal there was never a solid self underneath the effort.",
      contradictoryBehavior:
        "Collecting compliments while rewriting them as incomplete; asking for reassurance then distrusting it.",
      cost: "A life spent auditioning for a role that was never cast.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "SELF/identity",
    });

    const b = await createInsight({
      statement:
        "Postponing self-worth for the next achievement builds a shame debt that compounds interest with every win.",
      observation:
        "When praise arrives people still raise the bar so the feeling cannot land, renaming the habit as standards.",
      desire: "To finally feel enough without performing more for the next win.",
      hiddenFear:
        "That rest would reveal there was never a solid self underneath the effort and achievement.",
      contradictoryBehavior:
        "Collecting compliments while rewriting them as incomplete; asking for reassurance then distrusting the praise.",
      cost: "A life spent auditioning for a role that was never cast — shame compounding quietly.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "SELF/identity",
    });

    const result = await judgeInsightPair(a.id, b.id, { persist: true });
    expect(result.pairs.length).toBeGreaterThanOrEqual(1);
    const primary = result.primary!;
    expect(["hard_duplicate", "rewrite_zone"]).toContain(primary.verdict);
    expect(primary.similarities.INSIGHT_SIMILARITY).toBeGreaterThanOrEqual(
      DEFAULT_DEDUP_THRESHOLDS.rewriteZone - 0.02
    );
    expect(primary.duplicateCheckId).toBeTruthy();

    const check = await prisma.duplicateCheck.findUnique({
      where: { id: primary.duplicateCheckId! },
    });
    expect(check).toBeTruthy();
    expect(check!.insightId).toBe(a.id);
    expect(check!.comparedInsightId).toBe(b.id);
    expect(check!.insightSimilarity).toBeGreaterThan(0.5);
  });

  it("2. Known distinct pairs remain distinct / acceptable", async () => {
    const attachment = await createInsight({
      statement:
        "Attachment panic often destroys the relationship it is trying to save.",
      observation:
        "Clinging intensifies the moment someone pulls away — as if grip could manufacture closeness.",
      desire: "Permanent belonging.",
      hiddenFear: "Abandonment proving we were never chosen.",
      contradictoryBehavior: "Smothering the bond to prevent its ending.",
      cost: "Pushing away the person we meant to keep.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "ATTACHMENT/abandonment",
    });

    const society = await createInsight({
      statement:
        "Much of modern ambition is fear of being ordinary, dressed as taste.",
      observation:
        "Status signaling thrives on ambiguity — if the signal were honest, it would stop working.",
      desire: "Belonging to the room that decides what counts.",
      hiddenFear: "Being sorted into the irrelevant class.",
      contradictoryBehavior:
        "Mocking status games while playing them with better vocabulary.",
      cost: "Self-respect outsourced to strangers' glances.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "SOCIETY/status-signaling",
    });

    const result = await judgeInsightPair(attachment.id, society.id, {
      persist: true,
    });
    const primary = result.primary!;
    expect(["distinct", "acceptable"]).toContain(primary.verdict);
    expect(primary.similarities.INSIGHT_SIMILARITY).toBeLessThan(
      DEFAULT_DEDUP_THRESHOLDS.rewriteZone
    );
    expect(primary.verdict).not.toBe("hard_duplicate");
  });

  it("3. Embedding storage + retrieval works for insights/concepts/assets/visuals", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P4-EMB: Desire often wants the wanting more than the thing.",
      observation: "Craving peaks in anticipation — possession arrives mild.",
      desire: "The hit of wanting fulfilled.",
      hiddenFear: "Emptiness once the object is obtained.",
      contradictoryBehavior: "Chasing novelty while claiming to want peace.",
      cost: "A treadmill of almost-enough.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "DESIRE/craving",
    });

    const { statementEmb, fullEmb } = await embedInsightRecord(insight);
    expect(statementEmb.values.length).toBeGreaterThan(8);
    expect(fullEmb.dims).toBe(statementEmb.values.length);

    const fetched = await getEmbedding("human_insight", insight.id, "statement");
    expect(fetched).toBeTruthy();
    expect(fetched!.values.length).toBe(statementEmb.values.length);
    expect(vectorSimilarity(fetched!.values, statementEmb.values)).toBeGreaterThan(
      0.99
    );

    const concept = await createConcept({
      insightId: insight.id,
      title: "Wanting the Want",
      angle: "anticipation vs possession",
      hook: "Craving peaks before the thing arrives.",
      thesis: "Desire feeds on delay.",
      metadata: {
        metaphor: "treadmill of almost-enough",
        lens: "buddhist",
        structure: "question-pattern-price",
        ending: "cost_named",
      },
    });
    const cEmb = await embedConceptRecord(concept);
    expect(cEmb.kind).toBe("concept");

    const written = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "hard_truth",
      persist: true,
    });
    expect(written.contentAssetId).toBeTruthy();
    const asset = await prisma.contentAsset.findUniqueOrThrow({
      where: { id: written.contentAssetId! },
    });
    const aEmb = await embedContentAssetRecord(asset);
    expect(aEmb.kind).toBe("final_content");

    const visual = await directVisual({
      contentAssetId: written.contentAssetId!,
      pageSlug: "the-war-within",
      persist: true,
    });
    expect(visual.visualConceptId).toBeTruthy();
    const vc = await prisma.visualConcept.findUniqueOrThrow({
      where: { id: visual.visualConceptId! },
    });
    const vEmb = await embedVisualConceptRecord(vc);
    expect(vEmb.kind).toBe("visual");

    // Semantic search helpers
    const insightHits = await searchSimilarInsights(insight.statement, {
      limit: 50,
      minScore: 0.3,
    });
    expect(insightHits.some((h) => h.objectId === insight.id)).toBe(true);

    const conceptHits = await searchSimilarConcepts("anticipation vs possession", {
      limit: 50,
      minScore: 0.1,
    });
    expect(conceptHits.some((h) => h.objectId === concept.id)).toBe(true);

    // pgvector mirror (best-effort) — values row must exist
    const rowCount = await prisma.embedding.count({
      where: { objectId: insight.id },
    });
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });

  it("4. Genome similarity contributes to judgment", async () => {
    // Near-rewrite insight score but near-identical genomes → escalation
    const gA = {
      primaryConflict: "SELF/identity",
      secondaryConflicts: ["shame", "ambition"],
      primaryEmotion: "shame",
      secondaryEmotion: "longing",
      lenses: ["modern-psychology"],
      structure: "recognition-twist-cost",
      visualMetaphor: "debt ledger of self-worth",
      endingType: "open_recognition",
    };
    const gB = {
      primaryConflict: "SELF/identity",
      secondaryConflicts: ["shame", "ambition"],
      primaryEmotion: "shame",
      secondaryEmotion: "longing",
      lenses: ["modern-psychology"],
      structure: "recognition-twist-cost",
      visualMetaphor: "debt ledger of self-worth",
      endingType: "open_recognition",
    };
    const gScore = genomeSimilarity(gA, gB, 0.95);
    expect(gScore).toBeGreaterThan(0.9);

    const escalated = judgeFromSimilarities({
      TEXT_SIMILARITY: 0.7,
      INSIGHT_SIMILARITY: 0.74, // just under rewrite floor
      GENOME_SIMILARITY: gScore,
      VISUAL_SIMILARITY: 0.6,
    });
    expect(escalated.verdict).toBe("rewrite_zone");
    expect(escalated.reason.toLowerCase()).toMatch(/genome/);

    // Hard path: high insight alone
    const hard = judgeFromSimilarities({
      TEXT_SIMILARITY: 0.8,
      INSIGHT_SIMILARITY: 0.9,
      GENOME_SIMILARITY: 0.5,
      VISUAL_SIMILARITY: 0.4,
    });
    expect(hard.verdict).toBe("hard_duplicate");

    // Fixture embed: paraphrases closer than unrelated
    const [v1, v2, v3] = await embedTexts([
      "self-worth postponed achievement shame debt compounds",
      "postponing self-worth achievement creates shame debt compounds",
      "attachment panic clinging abandonment smothering bond",
    ]);
    const para = vectorSimilarity(v1!, v2!);
    const distinct = vectorSimilarity(v1!, v3!);
    expect(para).toBeGreaterThan(distinct);
    expect(para).toBeGreaterThan(0.7);
  });

  it("5. duplicate_checks records written from production/dedup path", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P4-PROD: Character is what you repeat when no audience is scoring you.",
      observation:
        "Discipline collapses in private long before it fails in public — secrecy is the first fracture.",
      desire: "To be the person others already believe we are.",
      hiddenFear: "That character is costume.",
      contradictoryBehavior:
        "Teaching integrity while negotiating with temptation in the dark.",
      cost: "A split life that eventually leaks.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "CHARACTER/discipline",
    });

    // Sibling asset so dedup has something to compare against
    const siblingConcept = await createConcept({
      insightId: insight.id,
      title: "Private Fracture",
      angle: "secrecy before public failure",
      hook: "Discipline dies in private first.",
      thesis: "Secrecy is the first fracture of character.",
      metadata: {
        format: "hard_truth",
        lens: "stoic",
        metaphor: "costume of character",
        structure: "before-after-hidden-engine",
        ending: "cost_named",
      },
    });
    const siblingWrite = await writeContent({
      conceptId: siblingConcept.id,
      pageSlug: "the-war-within",
      format: "hard_truth",
      persist: true,
    });
    expect(siblingWrite.contentAssetId).toBeTruthy();

    const produced = await runProductionPipeline({
      insightId: insight.id,
      pageSlug: "the-war-within",
      format: "hard_truth",
      persist: true,
      dedup: true,
      conceptCount: 2,
    });

    expect(produced.contentAssetId).toBeTruthy();
    expect(produced.dedup).toBeTruthy();
    expect(produced.dedup!.pairs.length).toBeGreaterThan(0);

    const checks = await prisma.duplicateCheck.findMany({
      where: { contentAssetId: produced.contentAssetId! },
    });
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[0]!.verdict).toBeTruthy();
    expect(checks[0]!.textSimilarity).not.toBeNull();
    expect(checks[0]!.insightSimilarity).not.toBeNull();
    expect(checks[0]!.genomeSimilarity).not.toBeNull();

    // DedupJudge prompt seeded
    const prompt = await getPromptVersion("dedup-judge", "1.0");
    expect(prompt).toBeTruthy();
    expect(prompt!.body).toMatch(/INSIGHT_SIMILARITY|Dedup Judge/i);
  });

  it("6. Phases 1–3 still pass (smoke: insight→concept→write→visual)", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P4-REG: Unmetabolized pain recruits the present to stage the past.",
      observation:
        "People rehearse old wounds in new rooms, hoping a different cast will rewrite the ending.",
      desire: "Repair without reopening the original pain.",
      hiddenFear: "That the wound defines them permanently.",
      contradictoryBehavior:
        "Seeking healing while selecting partners who reenact the injury.",
      cost: "Familiar suffering mistaken for destiny.",
      status: "approved",
      sourceType: "test-phase4",
      primaryConflictId: "SUFFERING/regret",
    });
    const concept = await createConcept({
      insightId: insight.id,
      title: "Recruited Present",
      angle: "reenactment as destiny",
      hook: "Old wounds find new rooms.",
      thesis: "Unmetabolized pain stages the present.",
      metadata: {
        format: "mini_reflection",
        lens: "existential",
        metaphor: "stage of the past",
        structure: "scene-confession-reframe",
        ending: "question_left_hanging",
      },
    });
    const written = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "mini_reflection",
      persist: true,
    });
    expect(written.contentAssetId).toBeTruthy();
    expect(written.genomeId).toBeTruthy();
    const visual = await directVisual({
      contentAssetId: written.contentAssetId!,
      persist: true,
    });
    expect(visual.direction.generation_prompt.length).toBeGreaterThan(20);
    expect(visual.visualConceptId).toBeTruthy();

    // Direct judgeDuplicates API still works
    const judged = await judgeDuplicates({
      contentAssetId: written.contentAssetId!,
      comparedToId: written.contentAssetId!, // will skip self in loop if same — use sibling from earlier path
      persist: false,
    });
    // Comparing to self may yield empty if filtered — create explicit other
    const other = await writeContent({
      conceptId: concept.id,
      pageSlug: "the-war-within",
      format: "atomic_quote",
      persist: true,
    });
    const judged2 = await judgeDuplicates({
      contentAssetId: written.contentAssetId!,
      comparedToId: other.contentAssetId!,
      persist: true,
    });
    expect(judged2.pairs.length).toBe(1);
    expect(judged2.primary!.similarities.GENOME_SIMILARITY).toBeGreaterThan(0);
    void judged;
  });
});
