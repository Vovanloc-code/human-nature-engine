/** Shared types for all Human Nature Engine agents. */

export type AgentName =
  | "insight-scout"
  | "insight-critic"
  | "concept-architect"
  | "writer"
  | "visual-director"
  | "slop-critic"
  | "dedup-judge"
  | "editor-chief";

export interface AgentInput {
  runId: string;
  payload: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface Agent {
  name: AgentName;
  run(input: AgentInput): Promise<AgentOutput>;
}

/** Candidate insight from A1 Insight Scout. */
export interface InsightCandidate {
  observation: string;
  desire: string;
  hidden_fear: string;
  contradiction: string;
  /** Alias used in DB as contradictory_behavior */
  contradictory_behavior?: string;
  cost: string;
  /** Human truth statement */
  statement: string;
  primaryConflictId?: string;
  lens?: PhilosophicalLensId;
  metadata?: Record<string, unknown>;
}

export type PhilosophicalLensId =
  | "neutral-humanist"
  | "stoic"
  | "buddhist"
  | "christian"
  | "renaissance-humanism"
  | "montaigne"
  | "machiavellian"
  | "modern-psychology"
  | "existential";

export interface CriticScores {
  humanRecognition: number; // 0–20
  originality: number; // 0–20
  emotionalPrecision: number; // 0–15
  clarity: number; // 0–15
  evergreenValue: number; // 0–10
  expansionPotential: number; // 0–10
  visualPotential: number; // 0–10
  total: number; // 0–100
}

export type CriticBand =
  | "reject"
  | "revise"
  | "usable"
  | "strong"
  | "exceptional";

export interface CriticResult {
  scores: CriticScores;
  band: CriticBand;
  approved: boolean;
  reason: string;
  revisionNotes?: string;
}

export type SlopViolationCode =
  | "GENERIC_MOTIVATION"
  | "EMPTY_PROFUNDITY"
  | "FAKE_WISDOM"
  | "FALSE_ATTRIBUTION"
  | "PREACHINESS"
  | "OVERSTATEMENT"
  | "THERAPY_CLICHE"
  | "AI_LANGUAGE"
  | "WEAK_INSIGHT"
  | "NO_SPECIFIC_HUMAN_TRUTH"
  | "UNSUPPORTED_PSYCHOLOGY";

export interface SlopViolation {
  code: SlopViolationCode;
  detail: string;
}

export interface SlopResult {
  pass: boolean;
  violations: SlopViolation[];
  reason: string;
  rewrite_instruction: string | null;
  attempts?: number;
  finalStatus?: "PASS" | "REWRITE" | "REJECT";
}

export interface ConceptDraft {
  title: string;
  angle: string;
  hook: string;
  thesis: string;
  domain: string;
  audience: string;
  format: string;
  lens: PhilosophicalLensId | string;
  metaphor: string;
  structure: string;
  ending: string;
  insightId?: string;
  metadata?: Record<string, unknown>;
}

/** Content formats for Writer v0.1 */
export type WriterFormat =
  | "atomic_quote"
  | "contradiction"
  | "hard_truth"
  | "inner_dialogue"
  | "reflective_question"
  | "mini_reflection"
  | "deep_reflection"
  | "carousel"
  | "micro_story"
  | "short_script";

export interface WriterDraft {
  format: WriterFormat;
  platform: string;
  language: string;
  headline: string;
  hook?: string;
  image_text?: string;
  caption?: string;
  cta?: string;
  alternate_hooks?: string[];
  carousel_slides?: string[];
  short_script?: string;
  body?: string;
  quality_score?: number;
  metadata?: Record<string, unknown>;
}

export type VisualUniverse =
  | "renaissance_chiaroscuro"
  | "modern_cinematic"
  | "symbolic_surrealism"
  | "fine_art_minimalism"
  | "documentary_realism"
  | "typography_first";

export interface VisualDirection {
  visual_concept: string;
  visual_rationale: string;
  composition: string;
  subject: string;
  environment: string;
  mood: string;
  lighting: string;
  camera_language: string;
  text_safe_area: string;
  generation_prompt: string;
  negative_constraints: string[];
  universe: VisualUniverse;
  metaphor?: string;
  palette?: string[];
  motif_tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Editor-in-Chief (A8) final ranking scores out of 100. */
export interface EditorScores {
  humanRecognition: number; // 0–20
  originalInsight: number; // 0–20
  emotionalPrecision: number; // 0–15
  clarity: number; // 0–15
  shareability: number; // 0–10
  visualPotential: number; // 0–10
  evergreenValue: number; // 0–10
  total: number; // 0–100
  /** Page DNA alignment bonus applied to ranking (not part of base 100). */
  pageDnaFit?: number;
  /** Diversity penalty applied when clustering with recent/selected (0–1 multiplier factors tracked separately). */
  diversityAdjustment?: number;
  /** Phase 7 soft learning overlay (rankScore only; not part of QC total). */
  learningBoost?: number;
  preferenceBoost?: number;
  performanceBoost?: number;
}

export type EditorVerdict = "best" | "alternate" | "reject";

export interface EditorScoredCandidate {
  contentAssetId?: string;
  title: string;
  format: string;
  scores: EditorScores;
  /** Adjusted ranking score after Page DNA + diversification (may differ from scores.total). */
  rankScore: number;
  passesFloor: boolean;
  verdict: EditorVerdict;
  WHY_THIS_WAS_SELECTED?: string;
  rejectReason?: string;
  primaryConflict?: string | null;
  visualMetaphor?: string | null;
  endingType?: string | null;
  hook?: string | null;
}
