/**
 * A6 Slop & Truth Critic — hard-reject low-signal / fake-wisdom content.
 * Deterministic rule engine (works in fixture mode; live LLM optional later).
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  SlopResult,
  SlopViolation,
  SlopViolationCode,
} from "../types";

const GENERIC_MOTIVATION = [
  /\bbelieve in yourself\b/i,
  /\byou (can|are) (do|enough) anything\b/i,
  /\bnever give up\b/i,
  /\bembrace your journey\b/i,
  /\bfollow your dreams?\b/i,
  /\byou'?ve got this\b/i,
  /\bgood vibes only\b/i,
  /\bmanifest (your|the)\b/i,
  /\bthe glow[\s-]?up\b/i,
  /\bhustle harder\b/i,
  /\bpeople should love themselves\b/i,
  /\blove yourself first\b/i,
];

const EMPTY_PROFUNDITY = [
  /\beverything happens for a reason\b/i,
  /\bthe universe has a plan\b/i,
  /\btrust the (process|timing)\b/i,
  /\bwhat is meant for you\b/i,
  /\bit'?s all part of the plan\b/i,
  /\bthe journey is the destination\b/i,
];

const FAKE_WISDOM = [
  /\bwake up and choose happiness\b/i,
  /\bbe the energy you want\b/i,
  /\bprotect your peace\b/i,
  /\bhigh vibes\b/i,
  /\byour only limit is you\b/i,
];

const THERAPY_CLICHE = [
  /\bhold space\b/i,
  /\bdo the (inner )?work\b/i,
  /\btoxic positivity\b/i, // meta-ok, but empty use flagged with weak context elsewhere
  /\binner child (heal|work)\b/i,
  /\btrigger(ed|ing)? warning:?\s*$/i,
  /\bset boundaries\b/i,
];

const AI_LANGUAGE = [
  /\bdelve (into|deeper)\b/i,
  /\btapestry of\b/i,
  /\bin today'?s fast[- ]paced (world|society)\b/i,
  /\bit'?s important to (note|remember|understand)\b/i,
  /\bleverage\b/i,
  /\bunlock your potential\b/i,
  /\bnavigate the complexities\b/i,
  /\bas an ai\b/i,
];

const PREACHINESS = [
  /\byou should (always|never|just)\b/i,
  /\bpeople should\b/i,
  /\bone must (always|never)\b/i,
  /\bnever forget to\b/i,
];

const OVERSTATEMENT = [
  /\balways (and forever|be)\b/i,
  /\bnever ever\b/i,
  /\bthe only (true )?way\b/i,
  /\beveryone knows that\b/i,
  /\bscience (has )?proven that\b/i,
];

const UNSUPPORTED_PSYCHOLOGY = [
  /\bstudies show\b/i,
  /\bresearch (has )?proven\b/i,
  /\bneuroscientists say\b/i,
  /\bwe only use 10%\b/i,
  /\bleft[- ]brained\b/i,
  /\blaw of attraction\b/i,
];

/** Patterns suggesting fabricated / false attribution of quotes. */
const FAMOUS_NAMES =
  "einstein|oprah|buddha|the buddha|marcus aurelius|confucius|steve jobs|rumi|plato|aristotle|nietzsche|socrates|gandhi|jesus|muhammad|seneca|epictetus|lao tzu|laozi|jung|freud";

const FALSE_ATTRIBUTION = [
  new RegExp(
    String.raw`\bas (${FAMOUS_NAMES})\s+(once\s+)?(said|wrote|famously)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(${FAMOUS_NAMES})\s+(once\s+)?(said|wrote|famously)\s*:`,
    "i"
  ),
  new RegExp(
    String.raw`["“][^"”]{8,}["”]\s*[-—–]\s*(${FAMOUS_NAMES})\b`,
    "i"
  ),
  new RegExp(
    String.raw`\baccording to (${FAMOUS_NAMES}|ancient wisdom)\b`,
    "i"
  ),
  new RegExp(String.raw`\b(${FAMOUS_NAMES})\s*:\s*["“]`, "i"),
];

function push(
  violations: SlopViolation[],
  code: SlopViolationCode,
  detail: string
) {
  if (!violations.some((v) => v.code === code && v.detail === detail)) {
    violations.push({ code, detail });
  }
}

function scanPatterns(
  text: string,
  patterns: RegExp[],
  code: SlopViolationCode,
  violations: SlopViolation[]
) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) push(violations, code, `Matched /${re.source}/ → "${m[0]}"`);
  }
}

export function critiqueText(text: string): SlopResult {
  const violations: SlopViolation[] = [];
  const trimmed = (text ?? "").trim();

  if (!trimmed || trimmed.length < 12) {
    push(violations, "WEAK_INSIGHT", "Text too short to carry a specific human truth");
  }

  scanPatterns(trimmed, GENERIC_MOTIVATION, "GENERIC_MOTIVATION", violations);
  scanPatterns(trimmed, EMPTY_PROFUNDITY, "EMPTY_PROFUNDITY", violations);
  scanPatterns(trimmed, FAKE_WISDOM, "FAKE_WISDOM", violations);
  scanPatterns(trimmed, FALSE_ATTRIBUTION, "FALSE_ATTRIBUTION", violations);
  scanPatterns(trimmed, PREACHINESS, "PREACHINESS", violations);
  scanPatterns(trimmed, OVERSTATEMENT, "OVERSTATEMENT", violations);
  scanPatterns(trimmed, AI_LANGUAGE, "AI_LANGUAGE", violations);
  scanPatterns(trimmed, UNSUPPORTED_PSYCHOLOGY, "UNSUPPORTED_PSYCHOLOGY", violations);

  // Therapy cliché: only hard-fail when the line is mostly the cliché
  for (const re of THERAPY_CLICHE) {
    const m = trimmed.match(re);
    if (m && trimmed.length < 80) {
      push(violations, "THERAPY_CLICHE", `Thin therapy-speak: "${m[0]}"`);
    }
  }

  // Specific human truth heuristics
  const hasConcreteObservation =
    /\b(when|people|we|you)\b/i.test(trimmed) &&
    !/^(believe|embrace|trust|love|follow)\b/i.test(trimmed);
  const hasConflictSignal =
    /\b(but|yet|while|instead|fear|cost|contradict|hide|pretend|avoid)\b/i.test(
      trimmed
    );

  if (
    trimmed.length > 0 &&
    trimmed.length < 60 &&
    !hasConflictSignal &&
    GENERIC_MOTIVATION.some((re) => re.test(trimmed))
  ) {
    push(
      violations,
      "NO_SPECIFIC_HUMAN_TRUTH",
      "Slogan-length line with no specific observation of human behavior"
    );
  }

  if (
    trimmed.split(/\s+/).length <= 6 &&
    !hasConcreteObservation
  ) {
    push(
      violations,
      "NO_SPECIFIC_HUMAN_TRUTH",
      "No specific human observation; reads as platitude"
    );
  }

  // Fake wisdom without contradiction/cost
  if (
    /wisdom|profound|truth is/i.test(trimmed) &&
    !hasConflictSignal &&
    trimmed.length < 100
  ) {
    push(violations, "FAKE_WISDOM", "Claims wisdom without naming conflict or cost");
  }

  const pass = violations.length === 0;
  const reason = pass
    ? "No hard-reject violations"
    : `Rejected: ${violations.map((v) => v.code).join(", ")}`;

  const rewrite_instruction = pass
    ? null
    : [
        "Rewrite to name a specific observed behavior, desire, hidden fear, contradiction, and cost.",
        "Remove slogans, fabricated attributions, preachy 'should' language, and unsupported psychology claims.",
        "Prefer uncomfortable recognition over motivation.",
        `Address: ${violations.map((v) => v.code).join(", ")}.`,
      ].join(" ");

  return {
    pass,
    violations,
    reason,
    rewrite_instruction,
    finalStatus: pass ? "PASS" : "REWRITE",
  };
}

/**
 * Run slop critic with up to maxAttempts rewrites.
 * After 2 failed automatic rewrites → REJECT.
 */
export function critiqueWithRewrites(
  initialText: string,
  rewriteFn: (text: string, instruction: string) => string,
  maxAttempts = 2
): SlopResult {
  let text = initialText;
  let last = critiqueText(text);
  let attempts = 0;

  while (!last.pass && attempts < maxAttempts) {
    attempts++;
    if (!last.rewrite_instruction) break;
    text = rewriteFn(text, last.rewrite_instruction);
    last = critiqueText(text);
  }

  if (!last.pass && attempts >= maxAttempts) {
    return {
      ...last,
      attempts,
      finalStatus: "REJECT",
      reason: `${last.reason} — exhausted ${maxAttempts} rewrite attempts → REJECT`,
    };
  }

  return { ...last, attempts, finalStatus: last.pass ? "PASS" : "REWRITE" };
}

export function runSlopCritic(payload: {
  text?: string;
  statement?: string;
  body?: string;
}): Omit<SlopResult, "attempts" | "finalStatus"> {
  const text = payload.text ?? payload.statement ?? payload.body ?? "";
  const result = critiqueText(text);
  return {
    pass: result.pass,
    violations: result.violations,
    reason: result.reason,
    rewrite_instruction: result.rewrite_instruction,
  };
}

export const agent: Agent = {
  name: "slop-critic",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const result = runSlopCritic(input.payload as { text?: string; statement?: string; body?: string });
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
