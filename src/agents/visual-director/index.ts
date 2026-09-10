/**
 * A5 Visual Director — meaning-first visual concepts.
 * Tracks visual overuse (e.g. lonely-window for every sad piece).
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  VisualDirection,
  VisualUniverse,
} from "../types";
import { getProvider } from "@/providers";
import { getActivePrompt } from "@/prompts";
import { prisma } from "@/db";

export const VISUAL_UNIVERSES: VisualUniverse[] = [
  "renaissance_chiaroscuro",
  "modern_cinematic",
  "symbolic_surrealism",
  "fine_art_minimalism",
  "documentary_realism",
  "typography_first",
];

/** Motifs that become cliché when repeated for the same emotion. */
export const OVERUSED_MOTIFS = [
  "lonely-window",
  "lonely window",
  "person staring out window",
  "rain on glass",
  "empty chair silhouette",
];

export const REQUIRED_VISUAL_FIELDS: (keyof VisualDirection)[] = [
  "visual_concept",
  "visual_rationale",
  "composition",
  "subject",
  "environment",
  "mood",
  "lighting",
  "camera_language",
  "text_safe_area",
  "generation_prompt",
  "negative_constraints",
  "universe",
];

export function assertVisualDirection(v: VisualDirection): void {
  for (const field of REQUIRED_VISUAL_FIELDS) {
    const val = v[field];
    if (val == null || val === "") {
      throw new Error(`Visual direction missing required field: ${field}`);
    }
  }
  if (!Array.isArray(v.negative_constraints) || v.negative_constraints.length < 1) {
    throw new Error("negative_constraints must be a non-empty array");
  }
  if (!v.generation_prompt || v.generation_prompt.length < 20) {
    throw new Error("generation_prompt must be substantive");
  }
  if (!(VISUAL_UNIVERSES as string[]).includes(v.universe)) {
    throw new Error(`Unknown visual universe: ${v.universe}`);
  }
}

export type VisualHistoryEntry = {
  universe?: string;
  motif?: string;
  subject?: string;
  metaphor?: string;
  style?: string;
};

export type DirectVisualInput = {
  contentAssetId: string;
  pageSlug?: string;
  persist?: boolean;
  /** Optional override history for tests */
  visualHistory?: VisualHistoryEntry[];
};

export type DirectVisualResult = {
  direction: VisualDirection;
  visualConceptId?: string;
  visualAssetId?: string;
  provider: string;
  promptVersion: string;
  avoidedMotifs: string[];
};

/** Load recent visual concepts for overuse tracking. */
export async function loadVisualHistory(
  pageId?: string,
  limit = 40
): Promise<VisualHistoryEntry[]> {
  const recent = await prisma.visualConcept.findMany({
    where: pageId
      ? { contentAsset: { pageId } }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { contentAsset: { select: { pageId: true } } },
  });

  return recent.map((vc) => {
    const meta = (vc.metadata ?? {}) as Record<string, unknown>;
    return {
      universe: vc.style ?? (typeof meta.universe === "string" ? meta.universe : undefined),
      motif: typeof meta.motif === "string" ? meta.motif : undefined,
      subject: typeof meta.subject === "string" ? meta.subject : undefined,
      metaphor: vc.metaphor ?? undefined,
      style: vc.style ?? undefined,
    };
  });
}

export function motifsToAvoid(history: VisualHistoryEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const h of history) {
    const key = (h.motif ?? h.subject ?? "").toLowerCase().trim();
    if (!key) continue;
    for (const over of OVERUSED_MOTIFS) {
      if (key.includes(over) || over.includes(key)) {
        counts.set(over, (counts.get(over) ?? 0) + 1);
      }
    }
    // Also track generic lonely-window language
    if (/window|lonely|rain on glass|empty chair/.test(key)) {
      counts.set("lonely-window", (counts.get("lonely-window") ?? 0) + 1);
    }
  }
  const avoid: string[] = [];
  for (const [motif, n] of counts) {
    if (n >= 1) avoid.push(motif);
  }
  // Always discourage default lonely-window if used recently
  if (history.some((h) => /window|lonely/.test(`${h.motif} ${h.subject}`.toLowerCase()))) {
    if (!avoid.includes("lonely-window")) avoid.push("lonely-window");
  }
  return avoid;
}

export function preferUniverse(
  history: VisualHistoryEntry[],
  pageVisualMix?: Record<string, unknown>
): VisualUniverse {
  const used = new Map<string, number>();
  for (const h of history) {
    const u = h.universe ?? h.style;
    if (u) used.set(u, (used.get(u) ?? 0) + 1);
  }

  const preferredFromDna = Array.isArray(pageVisualMix?.styles)
    ? (pageVisualMix!.styles as string[])
    : [];

  const ranked = [...VISUAL_UNIVERSES].sort((a, b) => {
    const ua = used.get(a) ?? 0;
    const ub = used.get(b) ?? 0;
    if (ua !== ub) return ua - ub;
    const ia = preferredFromDna.indexOf(a);
    const ib = preferredFromDna.indexOf(b);
    // Prefer DNA styles when tie
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return ranked[0]!;
}

export async function directVisual(
  input: DirectVisualInput
): Promise<DirectVisualResult> {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: input.contentAssetId },
    include: {
      genome: true,
      concept: { include: { insight: true } },
      page: { include: { dna: true } },
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${input.contentAssetId}`);

  const insight = asset.concept?.insight;
  if (!insight) {
    throw new Error("Visual Director requires content asset linked to insight via concept");
  }

  let page = asset.page;
  if (!page && input.pageSlug) {
    page = await prisma.page.findUnique({
      where: { slug: input.pageSlug },
      include: { dna: true },
    });
  }
  if (!page) {
    page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
      include: { dna: true },
    });
  }

  const history =
    input.visualHistory ?? (await loadVisualHistory(page?.id ?? asset.pageId ?? undefined));
  const avoidedMotifs = motifsToAvoid(history);
  const visualMix = (page?.dna?.visualMix ?? {}) as Record<string, unknown>;
  const preferredUniverse = preferUniverse(history, visualMix);

  const prompt = await getActivePrompt("visual-director");
  const provider = getProvider();

  const genome = asset.genome;
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;

  const structured = await provider.generateStructured<{
    direction?: VisualDirection;
  }>({
    system: prompt.body,
    prompt: [
      `Start from meaning, not aesthetics.`,
      `insight: ${insight.statement}`,
      `observation: ${insight.observation ?? ""}`,
      `desire: ${insight.desire ?? ""}`,
      `hidden_fear: ${insight.hiddenFear ?? ""}`,
      `cost: ${insight.cost ?? ""}`,
      `concept: ${asset.concept?.title ?? ""}`,
      `angle: ${asset.concept?.angle ?? ""}`,
      `genome_conflict: ${genome?.primaryConflict ?? insight.primaryConflictId ?? ""}`,
      `genome_emotion: ${genome?.primaryEmotion ?? ""}`,
      `genome_metaphor: ${genome?.visualMetaphor ?? ""}`,
      `headline: ${meta.headline ?? asset.title}`,
      `caption: ${meta.caption ?? asset.body ?? ""}`,
      `preferred_universe: ${preferredUniverse}`,
      `avoid_motifs: ${avoidedMotifs.join(", ") || "none"}`,
      `page_visual_mix: ${JSON.stringify(visualMix)}`,
      `Do NOT default to lonely-window imagery for sadness.`,
    ].join("\n"),
    schemaName: "visual-director",
    fixtureKey: "visual-director",
    context: {
      contentAssetId: asset.id,
      statement: insight.statement,
      emotion: genome?.primaryEmotion,
      metaphor: genome?.visualMetaphor ?? asset.concept?.angle,
      preferredUniverse,
      avoidedMotifs,
      visualMix,
      headline: meta.headline ?? asset.title,
      caption: meta.caption ?? asset.body,
    },
  });

  const direction = structured.direction;
  if (!direction) throw new Error("Visual Director produced no direction");
  assertVisualDirection(direction);

  // Enforce overuse avoidance in text
  const blob = `${direction.visual_concept} ${direction.subject} ${direction.environment} ${direction.generation_prompt}`.toLowerCase();
  if (avoidedMotifs.includes("lonely-window") && /lonely.?window|staring out (a |the )?window/.test(blob)) {
    throw new Error("Visual Director repeated overused lonely-window motif");
  }

  let visualConceptId: string | undefined;
  let visualAssetId: string | undefined;

  if (input.persist !== false) {
    const vc = await prisma.visualConcept.create({
      data: {
        contentAssetId: asset.id,
        title: direction.visual_concept.slice(0, 200),
        metaphor: direction.metaphor ?? direction.subject,
        style: direction.universe,
        palette: direction.palette ?? undefined,
        composition: direction.composition,
        status: "draft",
        metadata: {
          visual_concept: direction.visual_concept,
          visual_rationale: direction.visual_rationale,
          subject: direction.subject,
          environment: direction.environment,
          mood: direction.mood,
          lighting: direction.lighting,
          camera_language: direction.camera_language,
          text_safe_area: direction.text_safe_area,
          generation_prompt: direction.generation_prompt,
          negative_constraints: direction.negative_constraints,
          universe: direction.universe,
          motif: direction.motif_tags?.[0] ?? direction.subject,
          motif_tags: direction.motif_tags,
          avoidedMotifs,
          ...(direction.metadata ?? {}),
        },
      },
    });
    visualConceptId = vc.id;

    const stub = await prisma.visualAsset.create({
      data: {
        visualConceptId: vc.id,
        kind: "generation_brief",
        url: null,
        metadata: {
          generation_prompt: direction.generation_prompt,
          negative_constraints: direction.negative_constraints,
          status: "stub",
        },
      },
    });
    visualAssetId = stub.id;
  }

  return {
    direction,
    visualConceptId,
    visualAssetId,
    provider: provider.name,
    promptVersion: prompt.version,
    avoidedMotifs,
  };
}

export const agent: Agent = {
  name: "visual-director",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as Partial<DirectVisualInput>;
      if (!payload.contentAssetId) {
        return { success: false, error: "contentAssetId is required" };
      }
      const result = await directVisual(payload as DirectVisualInput);
      return {
        success: true,
        data: {
          direction: result.direction,
          visualConceptId: result.visualConceptId,
          visualAssetId: result.visualAssetId,
          provider: result.provider,
          promptVersion: result.promptVersion,
          avoidedMotifs: result.avoidedMotifs,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

export default agent;
