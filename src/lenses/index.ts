/**
 * Philosophical lenses — change interpretation of an insight.
 * Never fabricate quotations; lenses reshape framing only.
 */

import type { PhilosophicalLensId } from "@/agents/types";

export const PHILOSOPHICAL_LENSES: readonly PhilosophicalLensId[] = [
  "neutral-humanist",
  "stoic",
  "buddhist",
  "christian",
  "renaissance-humanism",
  "montaigne",
  "machiavellian",
  "modern-psychology",
  "existential",
] as const;

export type LensDefinition = {
  id: PhilosophicalLensId;
  name: string;
  framing: string;
  /** How the lens shifts emphasis — never invent quotes */
  interpretationHints: string[];
  forbidden: string[];
};

export const LENS_DEFINITIONS: Record<PhilosophicalLensId, LensDefinition> = {
  "neutral-humanist": {
    id: "neutral-humanist",
    name: "Neutral Humanist",
    framing: "Observe the human condition without dogma; dignity through recognition.",
    interpretationHints: [
      "Name the shared vulnerability without prescribing belief.",
      "Prefer concrete social observation over metaphysical claims.",
    ],
    forbidden: ["fabricated quotes", "sectarian certainty"],
  },
  stoic: {
    id: "stoic",
    name: "Stoic",
    framing: "Distinguish what is up to us from what is not; character over outcome.",
    interpretationHints: [
      "Highlight agency at the boundary of control.",
      "Treat emotion as judgment that can be examined.",
    ],
    forbidden: ["fabricated Marcus Aurelius quotes", "hustle-stoicism slogans"],
  },
  buddhist: {
    id: "buddhist",
    name: "Buddhist",
    framing: "Craving, attachment, and the relief of seeing clearly.",
    interpretationHints: [
      "Show clinging as the engine of suffering without exoticizing.",
      "Impermanence as lived fact, not decoration.",
    ],
    forbidden: ["fabricated Buddha quotes", "spiritual bypassing"],
  },
  christian: {
    id: "christian",
    name: "Christian",
    framing: "Conscience, grace, pride, and the cost of self-justification.",
    interpretationHints: [
      "Pride and mercy as relational realities.",
      "Avoid moralizing; show the inner conflict.",
    ],
    forbidden: ["fabricated scripture", "altar-call slogans"],
  },
  "renaissance-humanism": {
    id: "renaissance-humanism",
    name: "Renaissance Humanism",
    framing: "Human potential and frailty held in the same frame; dignity of inquiry.",
    interpretationHints: [
      "Juxtapose aspiration and limitation.",
      "Use civic/virtue language carefully, never as decoration.",
    ],
    forbidden: ["fabricated classical quotes"],
  },
  montaigne: {
    id: "montaigne",
    name: "Montaigne",
    framing: "Self-scrutiny, tentativeness, and the comedy of being human.",
    interpretationHints: [
      "Prefer essayistic honesty over thesis certainty.",
      "Admit contradiction as native to the self.",
    ],
    forbidden: ["fabricated Montaigne quotes", "false humility as brand"],
  },
  machiavellian: {
    id: "machiavellian",
    name: "Machiavellian",
    framing: "Power, appearance, and the gap between stated virtue and practiced interest.",
    interpretationHints: [
      "Expose strategic self-presentation without celebrating cruelty.",
      "Name incentives frankly.",
    ],
    forbidden: ["fabricated Machiavelli quotes", "cynicism as aesthetic only"],
  },
  "modern-psychology": {
    id: "modern-psychology",
    name: "Modern Psychology",
    framing: "Defense mechanisms, attachment patterns, and measurable human patterns.",
    interpretationHints: [
      "Describe patterns behaviorally; do not invent studies.",
      "Prefer clinical precision over pop-psych labels.",
    ],
    forbidden: ["unsupported study claims", "fabricated expert quotes"],
  },
  existential: {
    id: "existential",
    name: "Existential",
    framing: "Freedom, responsibility, absurdity, and meaning-making under finitude.",
    interpretationHints: [
      "Show choice as unavoidable and costly.",
      "Avoid nihilist pose; keep concrete lived stakes.",
    ],
    forbidden: ["fabricated Sartre/Camus quotes", "edgy despair as style"],
  },
};

export function isPhilosophicalLens(id: string): id is PhilosophicalLensId {
  return (PHILOSOPHICAL_LENSES as readonly string[]).includes(id);
}

export function getLens(id: PhilosophicalLensId): LensDefinition {
  return LENS_DEFINITIONS[id];
}

/** Apply lens framing notes to a concept/insight interpretation without inventing quotes. */
export function applyLensFraming(
  lensId: PhilosophicalLensId,
  baseText: string
): { lens: LensDefinition; framedGuidance: string } {
  const lens = getLens(lensId);
  return {
    lens,
    framedGuidance: [
      `Lens: ${lens.name}`,
      lens.framing,
      ...lens.interpretationHints.map((h) => `- ${h}`),
      `Do not invent quotations. Source material: ${baseText.slice(0, 240)}`,
    ].join("\n"),
  };
}
