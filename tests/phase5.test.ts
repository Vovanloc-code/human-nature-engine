import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { directVisual } from "../src/agents/visual-director";
import {
  rankPool,
  runEditorRank,
  assetToCandidate,
} from "../src/agents/editor-chief";
import {
  scoreEditorCandidate,
  DEFAULT_EDITOR_FLOOR,
  type EditorCandidateInput,
  type PageDnaSnapshot,
} from "../src/engine/ranking/editorial";
import { seedPhase5Prompts, getPromptVersion } from "../src/prompts";
import { createContentAsset, linkGenome } from "../src/engine/generation";

function strongBase(
  overrides: Partial<EditorCandidateInput> & {
    title: string;
    primaryConflict: string;
    insightStatement: string;
  }
): EditorCandidateInput {
  return {
    format: "hard_truth",
    hook: overrides.hook ?? `You know this already: ${overrides.title} lands quietly.`,
    body:
      overrides.body ??
      "When the private cost arrives, people quietly rename it as standards or fate.",
    observation:
      overrides.observation ??
      "When the feeling arrives, people quietly raise a private bar so recognition cannot land — then call it maturity.",
    desire:
      overrides.desire ?? "To finally feel enough without performing the next version.",
    hiddenFear:
      overrides.hiddenFear ??
      "That rest would reveal there was never a solid self underneath the effort.",
    contradiction:
      overrides.contradiction ??
      "Collecting proof while rewriting every proof as incomplete; asking for reassurance then distrusting it.",
    cost:
      overrides.cost ??
      "A life spent auditioning for a role that was never cast — shame compounding quietly.",
    visualMetaphor: overrides.visualMetaphor ?? "debt ledger of self-worth",
    endingType: overrides.endingType ?? "open_recognition",
    primaryEmotion: overrides.primaryEmotion ?? "shame",
    secondaryEmotion: overrides.secondaryEmotion ?? "longing",
    visualUniverse: overrides.visualUniverse ?? "renaissance_chiaroscuro",
    visualConcept: overrides.visualConcept ?? "Ledger lit from one side",
    structure: overrides.structure ?? "recognition-twist-cost",
    ...overrides,
  };
}

function weakCandidate(title: string): EditorCandidateInput {
  return {
    title,
    format: "atomic_quote",
    hook: "ok",
    body: "believe in yourself and unlock your potential",
    insightStatement: "Believe in yourself",
    primaryConflict: "SELF/identity",
  };
}

const WAR_WITHIN_DNA: PageDnaSnapshot = {
  topics: {
    primary: ["ego", "desire", "attachment", "character", "meaning"],
    weights: {
      ego: 0.22,
      desire: 0.2,
      attachment: 0.2,
      character: 0.2,
      meaning: 0.18,
    },
  },
  voice: {
    register: "intimate-philosophical",
    tone: ["direct", "compassionate", "unsentimental"],
    forbidden: ["generic motivation", "hustle-bro", "toxic positivity"],
    pov: "second-person-inclusive",
  },
  visualMix: {
    styles: [
      "renaissance_chiaroscuro",
      "symbolic_surreal",
      "documentary_still",
      "ink_wash_minimal",
    ],
    weights: {
      renaissance_chiaroscuro: 0.35,
      symbolic_surreal: 0.25,
      documentary_still: 0.2,
      ink_wash_minimal: 0.2,
    },
    motifs: ["mirror", "mask", "threshold", "shadow-self", "frayed-thread"],
  },
  formatMix: {
    formats: ["short_essay", "carousel", "reel_script", "thread", "visual_metaphor"],
    weights: {
      short_essay: 0.3,
      carousel: 0.25,
      reel_script: 0.2,
      thread: 0.15,
      visual_metaphor: 0.1,
    },
  },
  weights: {
    conflictEmphasis: ["EGO", "DESIRE", "ATTACHMENT", "CHARACTER", "MEANING"],
    depthBias: "high",
    noveltyFloor: 0.45,
  },
};

describe("Phase 5 — Editorial / Editor-in-Chief", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
    await seedPhase5Prompts();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. Editor ranks a pool and returns shortlist smaller than pool when many are weak", () => {
    const pool: EditorCandidateInput[] = [
      strongBase({
        title: "Enoughness Debt",
        primaryConflict: "SELF/identity",
        insightStatement:
          "Self-worth postponed until the next achievement is a debt that compounds interest in shame.",
      }),
      strongBase({
        title: "Private Fracture",
        primaryConflict: "CHARACTER/discipline",
        insightStatement:
          "Character is what you repeat when no audience is scoring you.",
        visualMetaphor: "costume hung on a chair",
        hook: "Discipline dies in rooms with no audience.",
        observation:
          "Discipline collapses in private long before it fails in public — secrecy is the first fracture.",
        desire: "To be the person others already believe we are.",
        hiddenFear: "That character is costume.",
        contradiction:
          "Teaching integrity while negotiating with temptation in the dark.",
        cost: "A split life that eventually leaks.",
      }),
      weakCandidate("Weak-1"),
      weakCandidate("Weak-2"),
      weakCandidate("Weak-3"),
      weakCandidate("Weak-4"),
      weakCandidate("Weak-5"),
      weakCandidate("Weak-6"),
      {
        title: "Mid-empty",
        format: "mini_reflection",
        hook: "short",
        body: "trust the process today",
        insightStatement: "Trust the process",
        primaryConflict: "MEANING/purpose",
      },
    ];

    for (const w of pool.filter((p) => p.title.startsWith("Weak") || p.title === "Mid-empty")) {
      expect(scoreEditorCandidate(w).total).toBeLessThan(DEFAULT_EDITOR_FLOOR);
    }

    const result = rankPool({
      candidates: pool,
      target: 5,
      pageDna: WAR_WITHIN_DNA,
    });

    expect(result.poolSize).toBe(pool.length);
    expect(result.shortlist.length).toBeGreaterThan(0);
    expect(result.shortlist.length).toBeLessThan(result.poolSize);
    expect(result.shortlist.length).toBeLessThanOrEqual(2); // only ~2 pass floor
    expect(result.rejects.length).toBeGreaterThan(result.shortlist.length);
  });

  it("2. WHY_THIS_WAS_SELECTED present and non-empty for selections", () => {
    const pool = [
      strongBase({
        title: "Attachment Panic",
        primaryConflict: "ATTACHMENT/abandonment",
        insightStatement:
          "Attachment panic often destroys the relationship it is trying to save.",
        visualMetaphor: "iron fist around a bird",
        hook: "Grip cannot manufacture closeness when someone steps back.",
        observation:
          "Clinging intensifies the moment someone pulls away — as if grip could manufacture closeness.",
        desire: "Permanent belonging.",
        hiddenFear: "Abandonment proving we were never chosen.",
        contradiction: "Smothering the bond to prevent its ending.",
        cost: "Pushing away the person we meant to keep.",
      }),
      strongBase({
        title: "Wanting the Want",
        primaryConflict: "DESIRE/craving",
        insightStatement:
          "Desire often wants the wanting more than the thing obtained.",
        visualMetaphor: "treadmill of almost-enough",
        hook: "Craving peaks before the thing arrives.",
        observation:
          "Craving peaks in anticipation — possession arrives mild and slightly disappointing.",
        desire: "The hit of wanting fulfilled forever.",
        hiddenFear: "Emptiness once the object is obtained.",
        contradiction: "Chasing novelty while claiming to want peace.",
        cost: "A treadmill of almost-enough that never stops.",
      }),
    ];

    const result = rankPool({
      candidates: pool,
      target: 2,
      pageDna: WAR_WITHIN_DNA,
    });

    expect(result.shortlist.length).toBe(2);
    for (const s of result.shortlist) {
      expect(s.WHY_THIS_WAS_SELECTED).toBeTruthy();
      expect(s.WHY_THIS_WAS_SELECTED!.trim().length).toBeGreaterThan(40);
      expect(s.WHY_THIS_WAS_SELECTED).toMatch(/Selected because|Selected as/i);
      expect(s.verdict === "best" || s.verdict === "alternate").toBe(true);
    }
    expect(result.best?.verdict).toBe("best");
    expect(result.best?.WHY_THIS_WAS_SELECTED).toMatch(/best/i);
  });

  it("3. Does not fill quota with failing candidates (prefer fewer)", () => {
    const pool = [
      strongBase({
        title: "Only Strong",
        primaryConflict: "EGO/pride",
        insightStatement:
          "Ego often protects the story of being right more carefully than the relationship it costs.",
        visualMetaphor: "mask welded to the face",
        hook: "Being right can cost more than being alone.",
        observation:
          "When challenged, people quietly double down on the story that keeps them intact — even as the room empties.",
        desire: "To remain unbroken in the eyes of others.",
        hiddenFear: "That correction would dissolve the self.",
        contradiction:
          "Demanding honesty while punishing the honest for wounding pride.",
        cost: "Loneliness dressed as integrity.",
      }),
      weakCandidate("Fail-A"),
      weakCandidate("Fail-B"),
      weakCandidate("Fail-C"),
      weakCandidate("Fail-D"),
    ];

    const result = rankPool({
      candidates: pool,
      target: 5, // ask for 5, only 1 passes
      floor: DEFAULT_EDITOR_FLOOR,
      pageDna: WAR_WITHIN_DNA,
    });

    expect(result.shortlist.length).toBe(1);
    expect(result.shortlist[0]!.title).toBe("Only Strong");
    expect(result.shortlist.every((s) => s.scores.total >= DEFAULT_EDITOR_FLOOR)).toBe(
      true
    );
    expect(result.rejects.some((r) => r.title.startsWith("Fail-"))).toBe(true);
    // Scores of rejects were not artificially raised
    for (const r of result.rejects.filter((x) => x.title.startsWith("Fail-"))) {
      expect(r.scores.total).toBeLessThan(DEFAULT_EDITOR_FLOOR);
      expect(r.passesFloor).toBe(false);
    }
  });

  it("4. Page DNA influences ranking (fixture)", () => {
    const onBrand = strongBase({
      title: "On-Brand Attachment",
      primaryConflict: "ATTACHMENT/abandonment",
      insightStatement:
        "Attachment panic often destroys the relationship it is trying to save.",
      format: "hard_truth",
      visualUniverse: "renaissance_chiaroscuro",
      visualMetaphor: "frayed thread at the threshold",
      hook: "You know this: clinging can finish what fear started.",
    });

    const offBrand = strongBase({
      title: "Off-Brand Hustle Status",
      primaryConflict: "SOCIETY/status-signaling",
      insightStatement:
        "Much of modern ambition is fear of being ordinary, dressed as taste — a hustle-bro status game.",
      format: "short_script",
      visualUniverse: "typography_first",
      visualMetaphor: "neon billboard of ambition",
      hook: "Hustle-bro culture sells belonging as a leaderboard.",
      body: "generic motivation and hustle-bro language dressed as insight about status.",
      observation:
        "Status signaling thrives on ambiguity — if the signal were honest, it would stop working in hustle-bro circles.",
      desire: "Belonging to the room that decides what counts.",
      hiddenFear: "Being sorted into the irrelevant class.",
      contradiction:
        "Mocking status games while playing them with better vocabulary.",
      cost: "Self-respect outsourced to strangers' glances.",
    });

    const onScore = scoreEditorCandidate(onBrand).total;
    const offScore = scoreEditorCandidate(offBrand).total;
    // Both can be strong on base rubric; DNA should tip rankScore
    expect(onScore).toBeGreaterThanOrEqual(DEFAULT_EDITOR_FLOOR);
    expect(offScore).toBeGreaterThanOrEqual(DEFAULT_EDITOR_FLOOR);

    const result = rankPool({
      candidates: [offBrand, onBrand],
      target: 1,
      pageDna: WAR_WITHIN_DNA,
    });

    expect(result.best?.title).toBe("On-Brand Attachment");
    expect(result.best!.rankScore).toBeGreaterThan(
      result.rejects.find((r) => r.title === "Off-Brand Hustle Status")!.rankScore
    );
  });

  it("5. Diversification avoids same-conflict cluster dominating top picks", () => {
    const attachmentHeavy: EditorCandidateInput[] = [
      strongBase({
        title: "Att-1",
        primaryConflict: "ATTACHMENT/abandonment",
        insightStatement:
          "Attachment panic often destroys the relationship it is trying to save.",
        visualMetaphor: "iron fist around a bird",
        hook: "Grip cannot manufacture closeness.",
      }),
      strongBase({
        title: "Att-2",
        primaryConflict: "ATTACHMENT/abandonment",
        insightStatement:
          "The fear of being left recruits every silence as evidence of departure.",
        visualMetaphor: "mailbox that never opens",
        hook: "Every silence becomes evidence of leaving.",
      }),
      strongBase({
        title: "Att-3",
        primaryConflict: "ATTACHMENT/anxiety",
        insightStatement:
          "Anxious attachment rehearses endings so thoroughly that presence becomes rehearsal too.",
        visualMetaphor: "empty rehearsal stage",
        hook: "Presence becomes another rehearsal of the ending.",
      }),
      strongBase({
        title: "Att-4",
        primaryConflict: "ATTACHMENT/abandonment",
        insightStatement:
          "Clinging intensifies the moment someone pulls away — as if grip could manufacture closeness.",
        visualMetaphor: "rope pulled until it burns",
        hook: "The harder the hold, the faster the leaving.",
      }),
      strongBase({
        title: "Character-1",
        primaryConflict: "CHARACTER/discipline",
        insightStatement:
          "Character is what you repeat when no audience is scoring you.",
        visualMetaphor: "costume hung on a chair",
        hook: "Discipline dies in rooms with no audience.",
        observation:
          "Discipline collapses in private long before it fails in public — secrecy is the first fracture.",
        desire: "To be the person others already believe we are.",
        hiddenFear: "That character is costume.",
        contradiction:
          "Teaching integrity while negotiating with temptation in the dark.",
        cost: "A split life that eventually leaks.",
      }),
      strongBase({
        title: "Desire-1",
        primaryConflict: "DESIRE/craving",
        insightStatement:
          "Desire often wants the wanting more than the thing obtained.",
        visualMetaphor: "treadmill of almost-enough",
        hook: "Craving peaks before possession arrives mild.",
        observation:
          "Craving peaks in anticipation — possession arrives mild and slightly disappointing.",
        desire: "The hit of wanting fulfilled forever.",
        hiddenFear: "Emptiness once the object is obtained.",
        contradiction: "Chasing novelty while claiming to want peace.",
        cost: "A treadmill of almost-enough that never stops.",
      }),
    ];

    const recentMemory = [
      {
        primaryConflict: "ATTACHMENT/abandonment",
        visualMetaphor: "frayed thread between two hands",
        endingType: "cost_named",
        hook: "prior relationship post 1",
      },
      {
        primaryConflict: "ATTACHMENT/abandonment",
        visualMetaphor: "frayed thread",
        endingType: "open_recognition",
        hook: "prior relationship post 2",
      },
      {
        primaryConflict: "ATTACHMENT/anxiety",
        visualMetaphor: "locked door",
        endingType: "cost_named",
        hook: "prior relationship post 3",
      },
    ];

    const result = rankPool({
      candidates: attachmentHeavy,
      target: 3,
      pageDna: WAR_WITHIN_DNA,
      recentMemory,
    });

    expect(result.shortlist.length).toBe(3);
    const clusters = result.shortlist.map(
      (s) => (s.primaryConflict ?? "").split("/")[0]!.toUpperCase()
    );
    const unique = new Set(clusters);
    // Must not be 3x ATTACHMENT
    expect(unique.size).toBeGreaterThanOrEqual(2);
    expect(clusters.filter((c) => c === "ATTACHMENT").length).toBeLessThanOrEqual(1);
    // Non-attachment strong pieces should appear
    expect(
      result.shortlist.some((s) =>
        ["CHARACTER", "DESIRE"].includes(
          (s.primaryConflict ?? "").split("/")[0]!.toUpperCase()
        )
      )
    ).toBe(true);
  });

  it("6. Phases 1–4 still pass (smoke) + editor persists quality_reviews", async () => {
    const insight = await createInsight({
      statement:
        "TEST-P5: Unmetabolized pain recruits the present to stage the past.",
      observation:
        "People rehearse old wounds in new rooms, hoping a different cast will rewrite the ending.",
      desire: "Repair without reopening the original pain.",
      hiddenFear: "That the wound defines them permanently.",
      contradictoryBehavior:
        "Seeking healing while selecting partners who reenact the injury.",
      cost: "Familiar suffering mistaken for destiny.",
      status: "approved",
      sourceType: "test-phase5",
      primaryConflictId: "SUFFERING/regret",
    });

    const concept = await createConcept({
      insightId: insight.id,
      title: "Recruited Present P5",
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

    const visual = await directVisual({
      contentAssetId: written.contentAssetId!,
      pageSlug: "the-war-within",
      persist: true,
    });
    expect(visual.visualConceptId).toBeTruthy();

    // Build a small DB pool: one strong produced asset + weak synthetic assets
    const page = await prisma.page.findUniqueOrThrow({
      where: { slug: "the-war-within" },
    });

    const weakAsset = await createContentAsset({
      pageId: page.id,
      title: "Believe harder",
      format: "atomic_quote",
      body: "believe in yourself",
      status: "draft",
      metadata: { hook: "ok", quality_score: 0.2 },
    });
    await linkGenome({
      contentAssetId: weakAsset.id,
      primaryConflict: "SELF/identity",
      visualMetaphor: "sparkles",
      endingType: "slogan",
    });

    const ranked = await runEditorRank({
      contentAssetIds: [written.contentAssetId!, weakAsset.id],
      pageSlug: "the-war-within",
      target: 5,
      persist: true,
      markReviewing: true,
    });

    expect(ranked.shortlist.length).toBeGreaterThanOrEqual(1);
    expect(ranked.shortlist.length).toBeLessThanOrEqual(2);
    expect(ranked.shortlist.every((s) => s.WHY_THIS_WAS_SELECTED)).toBe(true);
    expect(ranked.qualityReviewIds.length).toBeGreaterThanOrEqual(2);

    const reviews = await prisma.qualityReview.findMany({
      where: { contentAssetId: { in: [written.contentAssetId!, weakAsset.id] } },
      orderBy: { createdAt: "desc" },
    });
    expect(reviews.length).toBeGreaterThanOrEqual(2);
    expect(reviews.some((r) => r.reviewer === "editor-chief")).toBe(true);
    expect(
      reviews.some(
        (r) =>
          r.verdict === "best" ||
          r.verdict === "alternate" ||
          r.verdict === "reject"
      )
    ).toBe(true);

    const selected = ranked.shortlist[0]!;
    if (selected.contentAssetId) {
      const asset = await prisma.contentAsset.findUniqueOrThrow({
        where: { id: selected.contentAssetId },
      });
      expect(asset.status).toBe("reviewing");
    }

    const prompt = await getPromptVersion("editor-chief", "1.0");
    expect(prompt).toBeTruthy();
    expect(prompt!.body).toMatch(/WHY_THIS_WAS_SELECTED|Editor-in-Chief/i);

    // assetToCandidate round-trip
    const cand = await assetToCandidate(written.contentAssetId!);
    expect(cand.title.length).toBeGreaterThan(0);
    expect(cand.format).toBeTruthy();
  });
});
