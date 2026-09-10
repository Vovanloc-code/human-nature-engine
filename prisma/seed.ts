import { PrismaClient, InsightStatus } from "@prisma/client";
import { TAXONOMY, INSIGHT_SEEDS } from "./seed-data";
import { seedPhase2Prompts } from "../src/prompts";

const prisma = new PrismaClient();

async function seedTaxonomy() {
  let sortCat = 0;
  for (const [slug, nodes] of Object.entries(TAXONOMY)) {
    const cat = await prisma.taxonomyCategory.upsert({
      where: { slug },
      create: {
        slug,
        name: slug.charAt(0) + slug.slice(1).toLowerCase(),
        sortOrder: sortCat++,
      },
      update: { sortOrder: sortCat - 1 },
    });

    let sortNode = 0;
    for (const nodeSlug of nodes) {
      await prisma.taxonomyNode.upsert({
        where: {
          categoryId_slug: { categoryId: cat.id, slug: nodeSlug },
        },
        create: {
          categoryId: cat.id,
          slug: nodeSlug,
          name: nodeSlug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          sortOrder: sortNode++,
        },
        update: { sortOrder: sortNode - 1 },
      });
    }
  }
}

async function seedPage() {
  const page = await prisma.page.upsert({
    where: { slug: "the-war-within" },
    create: {
      slug: "the-war-within",
      name: "The War Within",
      description:
        "Human-nature content page exploring the inner conflicts of ego, desire, attachment, character, and meaning.",
    },
    update: {
      name: "The War Within",
      description:
        "Human-nature content page exploring the inner conflicts of ego, desire, attachment, character, and meaning.",
    },
  });

  await prisma.pageDna.upsert({
    where: { pageId: page.id },
    create: {
      pageId: page.id,
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
    },
    update: {
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
    },
  });

  return page;
}

async function seedInsights() {
  // Clear and reseed insights for idempotent Phase 1 seeding when empty-ish,
  // but prefer upsert-by-statement uniqueness via findFirst.
  let created = 0;
  let skipped = 0;

  for (const seed of INSIGHT_SEEDS) {
    const existing = await prisma.humanInsight.findFirst({
      where: { statement: seed.statement },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const primaryConflictId = `${seed.category}/${seed.node}`;
    const insight = await prisma.humanInsight.create({
      data: {
        statement: seed.statement,
        observation: seed.observation,
        desire: seed.desire,
        hiddenFear: seed.hiddenFear,
        contradictoryBehavior: seed.contradictoryBehavior,
        cost: seed.cost,
        primaryConflictId,
        secondaryConflicts: seed.secondaryConflicts ?? [],
        universalityScore: seed.universalityScore,
        depthScore: seed.depthScore,
        noveltyScore: seed.noveltyScore,
        recognitionScore: seed.recognitionScore,
        sourceType: "seed",
        sourceReference: "phase1-seed",
        status: seed.status as InsightStatus,
        metadata: {
          emotions: seed.emotions ?? [],
          domains: seed.domains ?? [],
          lenses: seed.lenses ?? [],
          category: seed.category,
          node: seed.node,
        },
      },
    });

    await prisma.insightSource.create({
      data: {
        insightId: insight.id,
        kind: "seed",
        reference: "prisma/seed-data.ts",
        notes: "Phase 1 human-truth seed",
      },
    });

    await prisma.ideaVault.create({
      data: {
        insightId: insight.id,
        tier: seed.exceptional ? "exceptional" : "standard",
        tags: [seed.category, seed.node, ...(seed.lenses ?? [])],
      },
    });

    created++;
  }

  return { created, skipped };
}

async function main() {
  console.log("Seeding taxonomy...");
  await seedTaxonomy();
  console.log("Seeding page + DNA...");
  await seedPage();
  console.log("Seeding insights...");
  const result = await seedInsights();
  console.log(`Insights created=${result.created} skipped=${result.skipped}`);
  console.log(`Total insight seeds in file: ${INSIGHT_SEEDS.length}`);
  console.log("Seeding Phase 2 prompt versions...");
  const prompts = await seedPhase2Prompts();
  console.log(
    "Prompts:",
    prompts.map((p) => `${p.agent}:${p.created ? "created" : "exists"}`).join(", ")
  );
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
