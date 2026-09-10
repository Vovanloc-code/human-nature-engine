/**
 * A1 Insight Scout — discover 5–30 candidate insights.
 * Uses provider adapter; fixture/deterministic when no API keys.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  InsightCandidate,
} from "../types";
import { getProvider } from "@/providers";
import { getActivePrompt } from "@/prompts";
import { prisma } from "@/db";
import { critiqueText } from "../slop-critic";

export type ScoutInput = {
  taxonomyArea: string;
  count?: number;
  min?: number;
  max?: number;
  pageGoals?: string[];
  pageSlug?: string;
  memoryLimit?: number;
};

const GENERIC_FORBIDDEN = [
  /people should love themselves/i,
  /believe in yourself/i,
  /embrace your journey/i,
  /everything happens for a reason/i,
];

function normalizeCandidate(raw: Record<string, unknown>): InsightCandidate | null {
  const statement = String(raw.statement ?? raw.human_truth ?? "").trim();
  const observation = String(raw.observation ?? "").trim();
  const desire = String(raw.desire ?? "").trim();
  const hidden_fear = String(raw.hidden_fear ?? raw.hiddenFear ?? "").trim();
  const contradiction = String(
    raw.contradiction ?? raw.contradictory_behavior ?? raw.contradictoryBehavior ?? ""
  ).trim();
  const cost = String(raw.cost ?? "").trim();

  if (!statement || !observation || !desire || !hidden_fear || !contradiction || !cost) {
    return null;
  }

  // Forbid generic advice
  const blob = `${statement} ${observation}`;
  if (GENERIC_FORBIDDEN.some((re) => re.test(blob))) {
    return null;
  }
  const slop = critiqueText(statement);
  if (!slop.pass && slop.violations.some((v) =>
    ["GENERIC_MOTIVATION", "EMPTY_PROFUNDITY", "PREACHINESS"].includes(v.code)
  )) {
    return null;
  }

  return {
    observation,
    desire,
    hidden_fear,
    contradiction,
    contradictory_behavior: contradiction,
    cost,
    statement,
    primaryConflictId: raw.primaryConflictId
      ? String(raw.primaryConflictId)
      : undefined,
    lens: raw.lens as InsightCandidate["lens"],
    metadata: (raw.metadata as Record<string, unknown>) ?? undefined,
  };
}

async function loadMemoryHints(area: string, limit: number): Promise<string[]> {
  const prefix = area.toUpperCase().split("/")[0] ?? area;
  const rows = await prisma.humanInsight.findMany({
    where: {
      OR: [
        { primaryConflictId: { startsWith: prefix } },
        { statement: { contains: prefix, mode: "insensitive" } },
      ],
      status: { in: ["approved", "used", "candidate"] },
    },
    orderBy: { recognitionScore: "desc" },
    take: limit,
    select: { statement: true },
  });
  return rows.map((r) => r.statement);
}

async function loadPageGoals(pageSlug?: string): Promise<string[] | undefined> {
  if (!pageSlug) return undefined;
  const page = await prisma.page.findUnique({
    where: { slug: pageSlug },
    include: { dna: true },
  });
  if (!page?.dna) return undefined;
  const topics = page.dna.topics as { primary?: string[] };
  return topics.primary ?? [];
}

export async function scoutInsights(input: ScoutInput): Promise<{
  candidates: InsightCandidate[];
  provider: string;
  promptVersion: string;
}> {
  const min = input.min ?? 5;
  const max = input.max ?? 30;
  const count = Math.min(max, Math.max(min, input.count ?? 8));

  const memoryHints = await loadMemoryHints(
    input.taxonomyArea,
    input.memoryLimit ?? 12
  );
  const pageGoals =
    input.pageGoals ?? (await loadPageGoals(input.pageSlug));

  const prompt = await getActivePrompt("insight-scout");
  const provider = getProvider();

  const structured = await provider.generateStructured<{
    candidates?: Array<Record<string, unknown>>;
  }>({
    system: prompt.body,
    prompt: [
      `Taxonomy area: ${input.taxonomyArea}`,
      `Produce ${count} candidates (min ${min}, max ${max}).`,
      pageGoals?.length ? `Page goals: ${pageGoals.join(", ")}` : "",
      memoryHints.length
        ? `Existing insight memory (do not paraphrase):\n- ${memoryHints.slice(0, 8).join("\n- ")}`
        : "No prior memory loaded.",
      "Every candidate needs observation, desire, hidden_fear, contradiction, cost, statement.",
      "Forbid generic advice.",
    ]
      .filter(Boolean)
      .join("\n"),
    schemaName: "insight-scout",
    fixtureKey: "insight-scout",
    context: {
      taxonomyArea: input.taxonomyArea,
      area: input.taxonomyArea,
      count,
      min,
      max,
      memoryHints,
      pageGoals,
    },
  });

  const rawList = structured.candidates ?? [];
  const candidates = rawList
    .map((r) => normalizeCandidate(r))
    .filter((c): c is InsightCandidate => c != null);

  // Ensure we still meet min in fixture mode if filters removed some
  if (candidates.length < min && provider.mode === "fixture") {
    const retry = await provider.generateStructured<{
      candidates: Array<Record<string, unknown>>;
    }>({
      prompt: "expand",
      fixtureKey: "insight-scout",
      context: {
        taxonomyArea: input.taxonomyArea,
        count: max,
        min,
        max,
        memoryHints,
        pageGoals,
      },
    });
    for (const r of retry.candidates ?? []) {
      const n = normalizeCandidate(r);
      if (n) candidates.push(n);
      if (candidates.length >= count) break;
    }
  }

  const sliced = candidates.slice(0, max);
  if (sliced.length < min) {
    throw new Error(
      `Scout produced ${sliced.length} valid candidates; need at least ${min}`
    );
  }

  return {
    candidates: sliced,
    provider: provider.name,
    promptVersion: prompt.version,
  };
}

export const agent: Agent = {
  name: "insight-scout",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as Partial<ScoutInput>;
      if (!payload.taxonomyArea) {
        return { success: false, error: "taxonomyArea is required" };
      }
      const result = await scoutInsights(payload as ScoutInput);
      return {
        success: true,
        data: {
          candidates: result.candidates,
          count: result.candidates.length,
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
