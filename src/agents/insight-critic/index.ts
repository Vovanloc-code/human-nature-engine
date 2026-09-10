/**
 * A2 Insight Critic — scores candidates; only usable+ continue.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  CriticBand,
  CriticResult,
  CriticScores,
  InsightCandidate,
} from "../types";
import { critiqueText } from "../slop-critic";

const GENERIC_PHRASES = [
  "believe in yourself",
  "embrace your journey",
  "everything happens for a reason",
  "love yourself",
  "follow your dreams",
  "trust the process",
  "you are enough",
  "good vibes",
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function bandFor(total: number): CriticBand {
  if (total < 65) return "reject";
  if (total < 75) return "revise";
  if (total < 85) return "usable";
  if (total < 93) return "strong";
  return "exceptional";
}

function fieldLen(s: string | undefined | null): number {
  return (s ?? "").trim().length;
}

function hasSpecificity(s: string): boolean {
  return (
    /\b(when|while|instead|then|before|after)\b/i.test(s) ||
    /\b(people|we|they)\b/i.test(s)
  );
}

export function scoreInsight(
  candidate: Partial<InsightCandidate> & { statement: string }
): CriticResult {
  const statement = candidate.statement?.trim() ?? "";
  const observation = candidate.observation?.trim() ?? "";
  const desire = candidate.desire?.trim() ?? "";
  const fear = (candidate.hidden_fear ?? "").trim();
  const contradiction = (
    candidate.contradiction ??
    candidate.contradictory_behavior ??
    ""
  ).trim();
  const cost = candidate.cost?.trim() ?? "";

  // Hard gate via slop critic on statement
  const slop = critiqueText(statement);
  if (!slop.pass) {
    const scores: CriticScores = {
      humanRecognition: 4,
      originality: 4,
      emotionalPrecision: 3,
      clarity: 5,
      evergreenValue: 3,
      expansionPotential: 2,
      visualPotential: 2,
      total: 23,
    };
    return {
      scores,
      band: "reject",
      approved: false,
      reason: `Slop gate failed: ${slop.reason}`,
      revisionNotes: slop.rewrite_instruction ?? undefined,
    };
  }

  // Human Recognition 0–20
  let humanRecognition = 8;
  if (fieldLen(observation) > 40 && hasSpecificity(observation)) humanRecognition += 6;
  if (fieldLen(observation) > 80) humanRecognition += 3;
  if (/\b(secret|private|quietly|pretend|hide)\b/i.test(observation + statement))
    humanRecognition += 2;
  humanRecognition = clamp(humanRecognition, 0, 20);

  // Originality 0–20
  let originality = 12;
  const lower = statement.toLowerCase();
  for (const g of GENERIC_PHRASES) {
    if (lower.includes(g)) originality -= 6;
  }
  if (fieldLen(contradiction) > 30) originality += 4;
  if (/\b(variant|echo against)\b/i.test(statement)) originality -= 2; // fixture expansion penalty mild
  originality = clamp(originality, 0, 20);

  // Emotional Precision 0–15
  let emotionalPrecision = 4;
  if (fieldLen(desire) > 15) emotionalPrecision += 4;
  if (fieldLen(fear) > 15) emotionalPrecision += 4;
  if (
    desire &&
    fear &&
    desire.toLowerCase() !== fear.toLowerCase()
  ) {
    emotionalPrecision += 3;
  }
  emotionalPrecision = clamp(emotionalPrecision, 0, 15);

  // Clarity 0–15
  let clarity = 6;
  const words = statement.split(/\s+/).length;
  if (words >= 8 && words <= 40) clarity += 5;
  else if (words > 40 && words <= 60) clarity += 3;
  else clarity -= 2;
  if (!/[.!?]/.test(statement) && words > 5) clarity += 1;
  if (statement.includes(" — ") || statement.includes(":")) clarity += 2;
  clarity = clamp(clarity, 0, 15);

  // Evergreen Value 0–10
  let evergreenValue = 6;
  if (/\b(app|tiktok|covid|crypto|ai hype)\b/i.test(statement)) evergreenValue -= 4;
  if (fieldLen(cost) > 20) evergreenValue += 2;
  evergreenValue = clamp(evergreenValue, 0, 10);

  // Expansion Potential 0–10
  let expansionPotential = 3;
  if (fieldLen(contradiction) > 40) expansionPotential += 3;
  if (fieldLen(cost) > 20) expansionPotential += 2;
  if (fieldLen(observation) > 60) expansionPotential += 2;
  expansionPotential = clamp(expansionPotential, 0, 10);

  // Visual Potential 0–10
  let visualPotential = 4;
  if (
    /\b(mask|mirror|room|scoreboard|thread|costume|debt|stage|ledger|chair)\b/i.test(
      `${statement} ${observation} ${cost}`
    )
  ) {
    visualPotential += 4;
  }
  if (fieldLen(observation) > 50) visualPotential += 2;
  visualPotential = clamp(visualPotential, 0, 10);

  const total =
    humanRecognition +
    originality +
    emotionalPrecision +
    clarity +
    evergreenValue +
    expansionPotential +
    visualPotential;

  const scores: CriticScores = {
    humanRecognition,
    originality,
    emotionalPrecision,
    clarity,
    evergreenValue,
    expansionPotential,
    visualPotential,
    total,
  };

  const band = bandFor(total);
  const approved = band === "usable" || band === "strong" || band === "exceptional";

  // Incomplete structure penalty already reflected; if critical fields missing → force revise/reject
  const missing: string[] = [];
  if (!observation) missing.push("observation");
  if (!desire) missing.push("desire");
  if (!fear) missing.push("hidden_fear");
  if (!contradiction) missing.push("contradiction");
  if (!cost) missing.push("cost");

  if (missing.length >= 3) {
    return {
      scores: { ...scores, total: Math.min(scores.total, 50) },
      band: "reject",
      approved: false,
      reason: `Missing critical fields: ${missing.join(", ")}`,
      revisionNotes: "Fill observation, desire, hidden_fear, contradiction, cost.",
    };
  }

  if (missing.length > 0 && approved) {
    return {
      scores: { ...scores, total: Math.min(scores.total, 72) },
      band: "revise",
      approved: false,
      reason: `Usable signal but missing: ${missing.join(", ")}`,
      revisionNotes: `Add: ${missing.join(", ")}`,
    };
  }

  return {
    scores,
    band,
    approved,
    reason: approved
      ? `Approved as ${band} (total ${total})`
      : `Not approved: ${band} (total ${total})`,
    revisionNotes: approved
      ? undefined
      : "Strengthen specificity of observation, contradiction, and cost; avoid slogans.",
  };
}

export function scoreMany(
  candidates: Array<Partial<InsightCandidate> & { statement: string }>
): CriticResult[] {
  return candidates.map(scoreInsight);
}

export const agent: Agent = {
  name: "insight-critic",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload;
      if (Array.isArray(payload.candidates)) {
        const results = scoreMany(
          payload.candidates as Array<Partial<InsightCandidate> & { statement: string }>
        );
        return {
          success: true,
          data: {
            results,
            approved: results.filter((r) => r.approved),
            rejected: results.filter((r) => !r.approved),
          },
        };
      }
      const result = scoreInsight(
        payload as Partial<InsightCandidate> & { statement: string }
      );
      return { success: true, data: result as unknown as Record<string, unknown> };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

export default agent;
