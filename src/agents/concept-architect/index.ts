/**
 * A3 Concept Architect — one approved insight → multiple genuinely different concepts.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  ConceptDraft,
  InsightCandidate,
  PhilosophicalLensId,
} from "../types";
import { getProvider } from "@/providers";
import { getActivePrompt } from "@/prompts";
import { applyLensFraming, isPhilosophicalLens } from "@/lenses";
import { createConcept } from "@/engine/concepts";
import { prisma } from "@/db";

export type ArchitectInput = {
  insightId: string;
  count?: number;
  persist?: boolean;
  preferredLenses?: PhilosophicalLensId[];
};

function diversityKey(c: ConceptDraft): string {
  return [c.domain, c.audience, c.format, c.angle, c.lens, c.metaphor, c.structure, c.ending]
    .map((x) => String(x ?? "").toLowerCase().trim())
    .join("|");
}

function isParaphrase(a: ConceptDraft, b: ConceptDraft): boolean {
  const ta = `${a.title} ${a.thesis} ${a.hook}`.toLowerCase();
  const tb = `${b.title} ${b.thesis} ${b.hook}`.toLowerCase();
  if (ta === tb) return true;
  const wordsA = new Set(ta.split(/\W+/).filter((w) => w.length > 3));
  const wordsB = tb.split(/\W+/).filter((w) => w.length > 3);
  if (wordsA.size === 0) return false;
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / Math.max(wordsB.length, 1) > 0.85 && a.angle === b.angle;
}

function dedupeConcepts(concepts: ConceptDraft[]): ConceptDraft[] {
  const out: ConceptDraft[] = [];
  const keys = new Set<string>();
  for (const c of concepts) {
    const k = diversityKey(c);
    if (keys.has(k)) continue;
    if (out.some((prev) => isParaphrase(prev, c))) continue;
    keys.add(k);
    out.push(c);
  }
  return out;
}

export async function architectConcepts(input: ArchitectInput): Promise<{
  concepts: ConceptDraft[];
  persistedIds: string[];
  provider: string;
  promptVersion: string;
}> {
  const insight = await prisma.humanInsight.findUnique({
    where: { id: input.insightId },
  });
  if (!insight) {
    throw new Error(`Insight not found: ${input.insightId}`);
  }
  if (insight.status !== "approved" && insight.status !== "used") {
    // Allow candidate only if caller insists via status already approved in pipeline
    // Pipeline should approve first; still allow approved-or-used strictly
    throw new Error(
      `Concept Architect requires approved/used insight; got status=${insight.status}`
    );
  }

  const count = input.count ?? 5;
  const prompt = await getActivePrompt("concept-architect");
  const provider = getProvider();

  const lensNotes = (input.preferredLenses ?? []).map((id) => {
    if (!isPhilosophicalLens(id)) return "";
    return applyLensFraming(id, insight.statement).framedGuidance;
  });

  const structured = await provider.generateStructured<{
    concepts?: ConceptDraft[];
  }>({
    system: prompt.body,
    prompt: [
      `insight_id: ${insight.id}`,
      `statement: ${insight.statement}`,
      `observation: ${insight.observation ?? ""}`,
      `desire: ${insight.desire ?? ""}`,
      `hidden_fear: ${insight.hiddenFear ?? ""}`,
      `contradiction: ${insight.contradictoryBehavior ?? ""}`,
      `cost: ${insight.cost ?? ""}`,
      `Produce ${count} genuinely different concepts (no paraphrases).`,
      "Vary domain/audience/format/angle/lens/metaphor/hook/structure/ending.",
      "Never fabricate quotations.",
      ...lensNotes,
    ].join("\n"),
    schemaName: "concept-architect",
    fixtureKey: "concept-architect",
    context: {
      insightId: insight.id,
      statement: insight.statement,
      count,
    },
  });

  let concepts = dedupeConcepts(
    (structured.concepts ?? []).map((c) => ({
      ...c,
      insightId: insight.id,
    }))
  );

  if (concepts.length < 1) {
    throw new Error("Concept Architect produced no distinct concepts");
  }

  const persistedIds: string[] = [];
  if (input.persist) {
    for (const c of concepts) {
      const row = await createConcept({
        insightId: insight.id,
        title: c.title,
        angle: c.angle,
        hook: c.hook,
        thesis: c.thesis,
        status: "draft",
        metadata: {
          domain: c.domain,
          audience: c.audience,
          format: c.format,
          lens: c.lens,
          metaphor: c.metaphor,
          structure: c.structure,
          ending: c.ending,
          ...(c.metadata ?? {}),
        },
      });
      persistedIds.push(row.id);
    }
  }

  return {
    concepts,
    persistedIds,
    provider: provider.name,
    promptVersion: prompt.version,
  };
}

/** Build a candidate-shaped object from DB insight for critic re-use. */
export function insightToCandidate(insight: {
  statement: string;
  observation: string | null;
  desire: string | null;
  hiddenFear: string | null;
  contradictoryBehavior: string | null;
  cost: string | null;
}): InsightCandidate {
  return {
    statement: insight.statement,
    observation: insight.observation ?? "",
    desire: insight.desire ?? "",
    hidden_fear: insight.hiddenFear ?? "",
    contradiction: insight.contradictoryBehavior ?? "",
    contradictory_behavior: insight.contradictoryBehavior ?? "",
    cost: insight.cost ?? "",
  };
}

export const agent: Agent = {
  name: "concept-architect",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as Partial<ArchitectInput>;
      if (!payload.insightId) {
        return { success: false, error: "insightId is required" };
      }
      const result = await architectConcepts(payload as ArchitectInput);
      return {
        success: true,
        data: {
          concepts: result.concepts,
          count: result.concepts.length,
          persistedIds: result.persistedIds,
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
