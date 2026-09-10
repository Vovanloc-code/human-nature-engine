/**
 * A4 Writer — approved Concept → finished draft in v0.1 formats.
 * Fixture-first; prompt_versions Writer v1.0.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  WriterDraft,
  WriterFormat,
} from "../types";
import { getProvider } from "@/providers";
import { getActivePrompt } from "@/prompts";
import { createContentAsset, linkGenome } from "@/engine/generation";
import { prisma } from "@/db";

export const WRITER_FORMATS: WriterFormat[] = [
  "atomic_quote",
  "contradiction",
  "hard_truth",
  "inner_dialogue",
  "reflective_question",
  "mini_reflection",
  "deep_reflection",
  "carousel",
  "micro_story",
  "short_script",
];

/** Phrases Writer must never emit (unless context truly earns "healing isn't linear"). */
export const WRITER_BANNED_PHRASES = [
  "in the tapestry of life",
  "unlock your potential",
  "embrace the journey",
  "embrace your journey",
  "be the best version of yourself",
  "everything happens for a reason",
  "choose yourself",
  "healing isn't linear",
  "healing isnt linear",
];

export function containsBannedSlop(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of WRITER_BANNED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

export function mapConceptFormatToWriterFormat(
  conceptFormat?: string | null
): WriterFormat {
  const f = (conceptFormat ?? "").toLowerCase().trim();
  if ((WRITER_FORMATS as string[]).includes(f)) return f as WriterFormat;
  if (f.includes("carousel")) return "carousel";
  if (f.includes("reel") || f.includes("script")) return "short_script";
  if (f.includes("thread") || f.includes("essay")) return "mini_reflection";
  if (f.includes("quote")) return "atomic_quote";
  if (f.includes("story")) return "micro_story";
  if (f.includes("question")) return "reflective_question";
  if (f.includes("dialogue")) return "inner_dialogue";
  if (f.includes("contradiction")) return "contradiction";
  return "hard_truth";
}

function collectDraftText(draft: WriterDraft): string {
  const parts = [
    draft.headline,
    draft.hook,
    draft.image_text,
    draft.caption,
    draft.cta,
    draft.body,
    draft.short_script,
    ...(draft.alternate_hooks ?? []),
    ...(draft.carousel_slides ?? []),
  ];
  return parts.filter(Boolean).join("\n");
}

export function sanitizeWriterDraft(draft: WriterDraft): WriterDraft {
  const text = collectDraftText(draft);
  const banned = containsBannedSlop(text);
  if (banned) {
    throw new Error(`Writer draft contains banned phrase: "${banned}"`);
  }
  // Soft guardrails — avoid diagnosing / absolute slogans without full slop hard-fail
  if (/\byou (have|are suffering from) (anxiety|depression|trauma|narcissism)\b/i.test(text)) {
    throw new Error("Writer draft diagnoses the reader");
  }
  return draft;
}

export type WriteContentInput = {
  conceptId: string;
  pageId?: string;
  pageSlug?: string;
  format?: WriterFormat;
  platform?: string;
  language?: string;
  persist?: boolean;
};

export type WriteContentResult = {
  draft: WriterDraft;
  contentAssetId?: string;
  genomeId?: string;
  provider: string;
  promptVersion: string;
};

function inferEmotion(statement: string): { primary: string; secondary: string } {
  const s = statement.toLowerCase();
  if (s.includes("shame") || s.includes("enough"))
    return { primary: "shame", secondary: "longing" };
  if (s.includes("ego") || s.includes("right") || s.includes("pride"))
    return { primary: "pride", secondary: "loneliness" };
  if (s.includes("fear") || s.includes("abandon"))
    return { primary: "fear", secondary: "grief" };
  if (s.includes("desire") || s.includes("want"))
    return { primary: "craving", secondary: "emptiness" };
  return { primary: "recognition", secondary: "unease" };
}

export async function writeContent(
  input: WriteContentInput
): Promise<WriteContentResult> {
  const concept = await prisma.concept.findUnique({
    where: { id: input.conceptId },
    include: { insight: true },
  });
  if (!concept) throw new Error(`Concept not found: ${input.conceptId}`);
  if (!concept.insight) throw new Error(`Concept ${input.conceptId} has no insight`);

  const insight = concept.insight;
  if (insight.status !== "approved" && insight.status !== "used") {
    throw new Error(
      `Writer requires approved/used insight; got status=${insight.status}`
    );
  }

  let pageId = input.pageId;
  if (!pageId && input.pageSlug) {
    const page = await prisma.page.findUnique({ where: { slug: input.pageSlug } });
    pageId = page?.id;
  }
  if (!pageId) {
    const page = await prisma.page.findUnique({ where: { slug: "the-war-within" } });
    pageId = page?.id;
  }

  const meta = (concept.metadata ?? {}) as Record<string, unknown>;
  const format =
    input.format ??
    mapConceptFormatToWriterFormat(
      typeof meta.format === "string" ? meta.format : concept.title
    );

  const prompt = await getActivePrompt("writer");
  const provider = getProvider();

  const structured = await provider.generateStructured<{ draft?: WriterDraft }>({
    system: prompt.body,
    prompt: [
      `concept_id: ${concept.id}`,
      `insight_id: ${insight.id}`,
      `statement: ${insight.statement}`,
      `observation: ${insight.observation ?? ""}`,
      `desire: ${insight.desire ?? ""}`,
      `hidden_fear: ${insight.hiddenFear ?? ""}`,
      `contradiction: ${insight.contradictoryBehavior ?? ""}`,
      `cost: ${insight.cost ?? ""}`,
      `concept_title: ${concept.title}`,
      `concept_angle: ${concept.angle ?? ""}`,
      `concept_hook: ${concept.hook ?? ""}`,
      `concept_thesis: ${concept.thesis ?? ""}`,
      `metaphor: ${String(meta.metaphor ?? "")}`,
      `lens: ${String(meta.lens ?? "")}`,
      `structure: ${String(meta.structure ?? "")}`,
      `ending: ${String(meta.ending ?? "")}`,
      `audience: ${String(meta.audience ?? "")}`,
      `format: ${format}`,
      `platform: ${input.platform ?? "instagram"}`,
      `language: ${input.language ?? "en"}`,
      "Write in intelligent, clear, human, emotionally precise, compassionate voice.",
      "Not preachy. Not fake-deep. No banned motivation slop.",
    ].join("\n"),
    schemaName: "writer",
    fixtureKey: "writer",
    context: {
      conceptId: concept.id,
      insightId: insight.id,
      statement: insight.statement,
      observation: insight.observation,
      desire: insight.desire,
      hiddenFear: insight.hiddenFear,
      contradiction: insight.contradictoryBehavior,
      cost: insight.cost,
      title: concept.title,
      angle: concept.angle,
      hook: concept.hook,
      thesis: concept.thesis,
      metaphor: meta.metaphor,
      lens: meta.lens,
      structure: meta.structure,
      ending: meta.ending,
      audience: meta.audience,
      format,
      platform: input.platform ?? "instagram",
      language: input.language ?? "en",
    },
  });

  let draft = structured.draft;
  if (!draft) {
    throw new Error("Writer produced no draft");
  }

  draft = {
    ...draft,
    format,
    platform: draft.platform ?? input.platform ?? "instagram",
    language: draft.language ?? input.language ?? "en",
  };

  draft = sanitizeWriterDraft(draft);

  let contentAssetId: string | undefined;
  let genomeId: string | undefined;

  if (input.persist !== false) {
    const emotions = inferEmotion(insight.statement);
    const asset = await createContentAsset({
      conceptId: concept.id,
      pageId,
      title: draft.headline,
      format: draft.format,
      body: draft.caption ?? draft.body ?? draft.hook ?? draft.image_text,
      status: "draft",
      metadata: {
        platform: draft.platform,
        headline: draft.headline,
        image_text: draft.image_text,
        caption: draft.caption,
        cta: draft.cta,
        language: draft.language,
        quality_score: draft.quality_score ?? 0.82,
        hook: draft.hook,
        alternate_hooks: draft.alternate_hooks,
        carousel_slides: draft.carousel_slides,
        short_script: draft.short_script,
        writer: {
          provider: provider.name,
          promptVersion: prompt.version,
          ...(draft.metadata ?? {}),
        },
      },
    });
    contentAssetId = asset.id;

    const genome = await linkGenome({
      contentAssetId: asset.id,
      primaryConflict: insight.primaryConflictId ?? undefined,
      secondaryConflicts: Array.isArray(insight.secondaryConflicts)
        ? (insight.secondaryConflicts as string[])
        : undefined,
      primaryEmotion: emotions.primary,
      secondaryEmotion: emotions.secondary,
      audienceWounds: [
        String(insight.hiddenFear ?? "being unseen"),
        String(insight.cost ?? "private cost"),
      ].filter(Boolean),
      lenses: meta.lens ? [String(meta.lens)] : ["neutral-humanist"],
      tones: ["direct", "compassionate", "unsentimental"],
      depthLevel:
        format === "deep_reflection" || format === "micro_story" ? "deep" : "medium",
      structure: String(meta.structure ?? "recognition-twist-cost"),
      visualMetaphor: String(meta.metaphor ?? "threshold between selves"),
      endingType: String(meta.ending ?? "open_recognition"),
    });
    genomeId = genome.id;
  }

  return {
    draft,
    contentAssetId,
    genomeId,
    provider: provider.name,
    promptVersion: prompt.version,
  };
}

export const agent: Agent = {
  name: "writer",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as Partial<WriteContentInput>;
      if (!payload.conceptId) {
        return { success: false, error: "conceptId is required" };
      }
      const result = await writeContent(payload as WriteContentInput);
      return {
        success: true,
        data: {
          draft: result.draft,
          contentAssetId: result.contentAssetId,
          genomeId: result.genomeId,
          provider: result.provider,
          promptVersion: result.promptVersion,
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
