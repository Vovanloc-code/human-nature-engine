/**
 * Deterministic fixture provider for CI / no-API-key runs.
 * Never claims to be a live LLM.
 */

import type {
  EmbedOpts,
  GenerateImageOpts,
  GenerateStructuredOpts,
  GenerateTextOpts,
  ProviderAdapter,
} from "./types";
import type { InsightCandidate, ConceptDraft, PhilosophicalLensId, WriterDraft, WriterFormat, VisualDirection, VisualUniverse } from "@/agents/types";

const AREA_TEMPLATES: Record<
  string,
  Array<Omit<InsightCandidate, "primaryConflictId" | "lens">>
> = {
  SELF: [
    {
      observation:
        "When praise arrives, people quietly raise the bar so the feeling cannot land — then call it standards.",
      desire: "To finally feel enough without performing more.",
      hidden_fear: "That rest would reveal there was never a solid self underneath the effort.",
      contradiction:
        "Collecting compliments while rewriting them as incomplete; asking for reassurance then distrusting it.",
      cost: "A life spent auditioning for a role that was never cast.",
      statement:
        "Self-worth postponed until the next achievement is a debt that compounds interest in shame.",
    },
    {
      observation:
        "People announce authenticity while editing every confession for likability.",
      desire: "To be known without being rejected.",
      hidden_fear: "That the unedited self is unlovable.",
      contradiction: "Sharing vulnerability as content while hiding the parts that would actually risk intimacy.",
      cost: "Connection that feels close and stays shallow.",
      statement:
        "Performed authenticity is still a costume — it just fits the current fashion.",
    },
    {
      observation:
        "Identity hardens around a single story of who we are, then we punish evidence that contradicts it.",
      desire: "Coherence — a self that makes sense across time.",
      hidden_fear: "Fragmentation; becoming someone we do not recognize.",
      contradiction: "Claiming growth while defending yesterday's narrative as sacred.",
      cost: "Relationships and opportunities sacrificed to keep the story intact.",
      statement:
        "We would rather be consistent than accurate about ourselves.",
    },
  ],
  EGO: [
    {
      observation:
        "Winning an argument feels like oxygen — until the room empties and the victory has no witness.",
      desire: "To be seen as right, and therefore safe.",
      hidden_fear: "Being ordinary, wrong, or replaceable.",
      contradiction: "Demanding humility from others while treating correction as attack.",
      cost: "Loneliness dressed as principle.",
      statement:
        "The need to be right often costs more intimacy than being wrong ever would.",
    },
    {
      observation:
        "Comparison scrolls never end because the feed always invents a higher rung.",
      desire: "Status that settles the question of worth.",
      hidden_fear: "Invisibility.",
      contradiction: "Preaching uniqueness while measuring life against strangers' highlights.",
      cost: "Envy that hollows out gratitude.",
      statement:
        "Ego outsources self-worth to a scoreboard it does not control.",
    },
  ],
  DESIRE: [
    {
      observation:
        "Craving peaks in the anticipation — possession often arrives as mild disappointment.",
      desire: "The hit of wanting fulfilled.",
      hidden_fear: "Emptiness once the object is obtained.",
      contradiction: "Chasing novelty while claiming to want peace.",
      cost: "A treadmill of almost-enough.",
      statement:
        "Desire often wants the wanting more than the thing.",
    },
  ],
  FEAR: [
    {
      observation:
        "People avoid the conversation that would clarify a relationship because clarity might end it.",
      desire: "Safety through ambiguity.",
      hidden_fear: "Definite rejection.",
      contradiction: "Complaining about uncertainty while refusing the question that would resolve it.",
      cost: "Years spent in limbo that already felt like loss.",
      statement:
        "Fear of confirmation keeps people married to suspense.",
    },
  ],
  ATTACHMENT: [
    {
      observation:
        "Clinging intensifies the moment someone pulls away — as if grip could manufacture closeness.",
      desire: "Permanent belonging.",
      hidden_fear: "Abandonment proving we were never chosen.",
      contradiction: "Smothering the bond to prevent its ending.",
      cost: "Pushing away the person we meant to keep.",
      statement:
        "Attachment panic often destroys the relationship it is trying to save.",
    },
  ],
  RELATIONSHIPS: [
    {
      observation:
        "Caretaking becomes control when love is measured by how little the other person needs anyone else.",
      desire: "To be indispensable.",
      hidden_fear: "Being left once they no longer need us.",
      contradiction: "Saying 'I just want you happy' while punishing independence.",
      cost: "Resentment on both sides of the rescue.",
      statement:
        "Love that requires dependency is a contract, not a bond.",
    },
  ],
  CHARACTER: [
    {
      observation:
        "Discipline collapses in private long before it fails in public — secrecy is the first fracture.",
      desire: "To be the person others already believe we are.",
      hidden_fear: "That character is costume.",
      contradiction: "Teaching integrity while negotiating with temptation in the dark.",
      cost: "A split life that eventually leaks.",
      statement:
        "Character is what you repeat when no audience is scoring you.",
    },
  ],
  SUFFERING: [
    {
      observation:
        "People rehearse old wounds in new rooms, hoping a different cast will rewrite the ending.",
      desire: "Repair without reopening the original pain.",
      hidden_fear: "That the wound defines them permanently.",
      contradiction: "Seeking healing while selecting partners who reenact the injury.",
      cost: "Familiar suffering mistaken for destiny.",
      statement:
        "Unmetabolized pain recruits the present to stage the past.",
    },
  ],
  MEANING: [
    {
      observation:
        "Busyness postpones the question of purpose until the calendar becomes the answer.",
      desire: "A life that matters without having to name why.",
      hidden_fear: "That meaning will not appear if we stop moving.",
      contradiction: "Collecting achievements while calling the emptiness 'just a phase'.",
      cost: "A full résumé and a thin inner life.",
      statement:
        "Motion can be a sophisticated form of meaning-avoidance.",
    },
  ],
  SOCIETY: [
    {
      observation:
        "Status signaling thrives on ambiguity — if the signal were honest, it would stop working.",
      desire: "Belonging to the room that decides what counts.",
      hidden_fear: "Being sorted into the irrelevant class.",
      contradiction: "Mocking status games while playing them with better vocabulary.",
      cost: "Self-respect outsourced to strangers' glances.",
      statement:
        "Much of modern ambition is fear of being ordinary, dressed as taste.",
    },
  ],
};

const DEFAULT_AREA = "SELF";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickLens(seed: number): PhilosophicalLensId {
  const lenses: PhilosophicalLensId[] = [
    "neutral-humanist",
    "stoic",
    "buddhist",
    "christian",
    "renaissance-humanism",
    "montaigne",
    "machiavellian",
    "modern-psychology",
    "existential",
  ];
  return lenses[seed % lenses.length]!;
}

function expandCandidates(
  area: string,
  count: number,
  memoryHints: string[],
  pageGoals?: string[]
): InsightCandidate[] {
  const key = area.toUpperCase().split("/")[0] ?? DEFAULT_AREA;
  const base = AREA_TEMPLATES[key] ?? AREA_TEMPLATES[DEFAULT_AREA]!;
  const out: InsightCandidate[] = [];
  const seed = hashSeed(`${area}|${count}|${memoryHints.join("|")}|${(pageGoals ?? []).join("|")}`);

  for (let i = 0; i < count; i++) {
    const t = base[i % base.length]!;
    const variant = i;
    const memoryBit =
      memoryHints.length > 0
        ? memoryHints[i % memoryHints.length]!.slice(0, 80)
        : null;
    const goalBit =
      pageGoals && pageGoals.length > 0
        ? pageGoals[i % pageGoals.length]
        : null;

    const observation =
      variant === 0
        ? t.observation
        : `${t.observation} (variant ${variant + 1}: pressure shows up in small delays and avoided eye contact.)`;

    const statement =
      memoryBit && variant % 3 === 0
        ? `${t.statement} Echo against known memory: ${memoryBit}…`
        : goalBit && variant % 5 === 0
          ? `${t.statement} Page goal pull: ${goalBit}.`
          : variant === 0
            ? t.statement
            : `${t.statement} Depth cut ${variant + 1}: the private cost surfaces in how we treat waiters, inboxes, and silence.`;

    out.push({
      observation,
      desire: t.desire,
      hidden_fear: t.hidden_fear,
      contradiction: t.contradiction,
      contradictory_behavior: t.contradiction,
      cost: t.cost,
      statement,
      primaryConflictId: `${key}/${["identity", "shame", "pride", "craving", "rejection", "people", "love", "discipline", "regret", "purpose", "status-signaling"][i % 11]}`,
      lens: pickLens(seed + i),
      metadata: {
        source: "fixture-scout",
        area: key,
        variant,
        pageGoal: goalBit ?? null,
      },
    });
  }

  return out;
}

function conceptsFromInsight(ctx: Record<string, unknown>): ConceptDraft[] {
  const statement = String(ctx.statement ?? "Untitled human truth");
  const insightId = ctx.insightId ? String(ctx.insightId) : undefined;
  const lenses: PhilosophicalLensId[] = [
    "stoic",
    "modern-psychology",
    "existential",
    "montaigne",
    "machiavellian",
  ];
  const formats = ["short_essay", "carousel", "reel_script", "thread", "visual_metaphor"];
  const audiences = ["overachievers", "people-pleasers", "anxious partners", "quiet quitters", "status climbers"];
  const domains = ["identity", "relationships", "work", "desire", "meaning"];
  const structures = [
    "recognition-twist-cost",
    "scene-confession-reframe",
    "question-pattern-price",
    "mirror-metaphor-release",
    "before-after-hidden-engine",
  ];
  const endings = [
    "open_recognition",
    "quiet_dare",
    "cost_named",
    "question_left_hanging",
    "soft_absolution",
  ];
  const metaphors = [
    "mask that grows into the face",
    "debt ledger of self-worth",
    "room with two chairs and one exit",
    "scoreboard with no final whistle",
    "thread pulled until the sweater vanishes",
  ];
  const angles = [
    "private cost of public competence",
    "how love becomes control",
    "ambition as fear of ordinariness",
    "the comedy of self-surveillance",
    "power dressed as care",
  ];

  const count = Math.min(8, Math.max(3, Number(ctx.count ?? 5)));
  const drafts: ConceptDraft[] = [];
  for (let i = 0; i < count; i++) {
    drafts.push({
      title: `${angles[i]!.replace(/^./, (c) => c.toUpperCase())} — cut ${i + 1}`,
      angle: angles[i]!,
      hook: `You know this already: ${statement.slice(0, 90)}…`,
      thesis: `Through a ${lenses[i]!} lens, the insight reveals a different pressure point: ${angles[i]}.`,
      domain: domains[i]!,
      audience: audiences[i]!,
      format: formats[i]!,
      lens: lenses[i]!,
      metaphor: metaphors[i]!,
      structure: structures[i]!,
      ending: endings[i]!,
      insightId,
      metadata: { source: "fixture-architect", index: i },
    });
  }
  return drafts;
}


function writerDraftFromContext(ctx: Record<string, unknown>): WriterDraft {
  const statement = String(ctx.statement ?? "A human truth waits to be named.");
  const format = (String(ctx.format ?? "hard_truth") as WriterFormat);
  const angle = String(ctx.angle ?? "private cost");
  const hookBase = String(ctx.hook ?? "").trim();
  const cost = String(ctx.cost ?? "a quiet private cost");
  const contradiction = String(ctx.contradiction ?? "wanting closeness while performing distance");
  const observation = String(ctx.observation ?? statement);
  const desire = String(ctx.desire ?? "to feel enough");
  const fear = String(ctx.hiddenFear ?? ctx.hidden_fear ?? "being ordinary");
  const shortStatement = statement.length > 140 ? statement.slice(0, 137) + "…" : statement;

  const hook =
    hookBase ||
    `You already know this pattern: ${shortStatement}`;

  const image_text = shortStatement;
  const caption = [
    observation.length > 20 ? observation.slice(0, 220) : `We notice it in small delays: ${shortStatement}`,
    `What we want: ${desire}.`,
    `What we protect ourselves from: ${fear}.`,
    `The contradiction: ${contradiction}.`,
    `The cost: ${cost}.`,
  ].join(" ");

  const cta = "Sit with the recognition — no slogan required.";
  const alternate_hooks = [
    `The quiet part: ${shortStatement}`,
    `If this stings, it is because it is specific: ${angle}.`,
  ];

  const base: WriterDraft = {
    format,
    platform: String(ctx.platform ?? "instagram"),
    language: String(ctx.language ?? "en"),
    headline: String(ctx.title ?? angle).slice(0, 120) || "Recognition without the slogan",
    hook,
    image_text,
    caption,
    cta,
    alternate_hooks,
    quality_score: 0.84,
    metadata: { source: "fixture-writer" },
  };

  if (format === "carousel") {
    base.carousel_slides = [
      hook,
      `Desire: ${desire}`,
      `Hidden fear: ${fear}`,
      `Contradiction: ${contradiction}`,
      `Cost: ${cost}`,
      shortStatement,
    ];
  }
  if (format === "short_script") {
    base.short_script = [
      `VO: ${hook}`,
      `CUT TO: a small private moment that proves the pattern.`,
      `VO: ${shortStatement}`,
      `BEAT: ${cost}`,
      `END ON: a question left hanging — not a pep talk.`,
    ].join("\n");
  }
  if (format === "atomic_quote") {
    base.image_text = shortStatement;
    base.caption = `${shortStatement}\n\n${cta}`;
  }
  if (format === "inner_dialogue") {
    base.body = [
      `Voice A: ${desire}`,
      `Voice B: ${fear}`,
      `Voice A: But if I stop performing—`,
      `Voice B: Then who are you without the audition?`,
      `Narrator: ${shortStatement}`,
    ].join("\n");
  }
  if (format === "reflective_question") {
    base.hook = `What if the thing you call discipline is mostly fear of being seen without proof?`;
    base.caption = `${base.hook}\n\n${shortStatement}\n\n${cta}`;
  }
  if (format === "micro_story") {
    base.body = `She collected compliments the way some people collect spare keys — none of them opened the door she actually lived behind. ${shortStatement}`;
    base.caption = base.body;
  }
  if (format === "deep_reflection" || format === "mini_reflection") {
    base.body = caption;
  }
  if (format === "contradiction") {
    base.hook = contradiction;
    base.caption = `${contradiction}\n\nCost: ${cost}\n\n${shortStatement}`;
  }

  return base;
}

function visualDirectionFromContext(ctx: Record<string, unknown>): VisualDirection {
  const preferred = String(ctx.preferredUniverse ?? "renaissance_chiaroscuro") as VisualUniverse;
  const avoided = Array.isArray(ctx.avoidedMotifs)
    ? (ctx.avoidedMotifs as string[]).map((s) => String(s).toLowerCase())
    : [];
  const emotion = String(ctx.emotion ?? "recognition");
  const metaphor = String(ctx.metaphor ?? "threshold between selves");
  const statement = String(ctx.statement ?? "human conflict");

  const universePool: VisualUniverse[] = [
    "renaissance_chiaroscuro",
    "modern_cinematic",
    "symbolic_surrealism",
    "fine_art_minimalism",
    "documentary_realism",
    "typography_first",
  ];
  let universe = (universePool.includes(preferred) ? preferred : "symbolic_surrealism") as VisualUniverse;

  // Motif catalog — never lonely-window when avoided
  const motifs = [
    {
      tag: "split-mask",
      subject: "a cracked porcelain mask held in two hands",
      environment: "a spare studio with a single hard light and dark negative space",
      composition: "centered subject, deep shadow left third reserved for text",
    },
    {
      tag: "debt-ledger",
      subject: "an open ledger with one unfinished column of chalk tally marks",
      environment: "oak desk, late afternoon sidelight, dust in the beam",
      composition: "top-down three-quarter, lower-right text-safe field empty",
    },
    {
      tag: "two-chairs",
      subject: "two chairs facing each other; one slightly pushed back",
      environment: "empty room, scuffed floorboards, doorway light",
      composition: "wide frame with negative space along the top third",
    },
    {
      tag: "frayed-thread",
      subject: "a sweater mid-unravel, thread pulled taut between fingers",
      environment: "neutral tabletop, soft bounce fill, no faces",
      composition: "macro close-up; left margin clear for typography",
    },
    {
      tag: "threshold-mirror",
      subject: "a person half in / half out of a doorway mirror, face turned away",
      environment: "liminal hallway, cool daylight mixed with warm interior lamp",
      composition: "vertical frame; upper third kept clean for overlay text",
    },
    {
      tag: "typography-field",
      subject: "no figure — only a single concrete object (key, ring, ticket stub)",
      environment: "flat paper texture with grain, museum-lit",
      composition: "object lower-left; large quiet field upper-right for text",
    },
  ];

  // Pick motif that is not overused lonely-window
  let pick = motifs[hashSeed(statement + metaphor) % motifs.length]!;
  if (avoided.some((a) => a.includes("lonely-window") || a.includes("window"))) {
    // Prefer non-window motifs explicitly
    pick = motifs.find((m) => m.tag !== "threshold-mirror") ?? motifs[0]!;
    if (universe === "documentary_realism") {
      universe = "symbolic_surrealism";
    }
  }

  const lighting =
    universe === "renaissance_chiaroscuro"
      ? "single-source chiaroscuro, Rembrandt edge, deep blacks"
      : universe === "modern_cinematic"
        ? "anamorphic flare restrained, practicals only, cool key"
        : universe === "fine_art_minimalism"
          ? "soft north-light, almost shadowless midtones"
          : universe === "documentary_realism"
            ? "available light, slight underexposure, handheld honesty"
            : universe === "typography_first"
              ? "even museum lighting, low contrast for legibility"
              : "surreal soft rim with unreal color accent";

  const camera =
    universe === "typography_first"
      ? "static locked-off still, 50mm equivalent, flat plane"
      : universe === "modern_cinematic"
        ? "35mm shallow DOF, slight Dutch avoided, eye-level"
        : "50mm medium, controlled depth, contemplative stillness";

  const generation_prompt = [
    `${universe.replace(/_/g, " ")} photograph/painting of ${pick.subject}.`,
    `Environment: ${pick.environment}.`,
    `Mood: intimate, unsentimental, emotionally precise — emotion=${emotion}.`,
    `Lighting: ${lighting}.`,
    `Camera: ${camera}.`,
    `Composition: ${pick.composition}.`,
    `Metaphor: ${metaphor}.`,
    `Meaning anchor: ${statement.slice(0, 120)}.`,
    `Leave text-safe negative space. No logos, no watermarks, no motivational poster look.`,
  ].join(" ");

  const negative = [
    "motivational poster typography",
    "stock-photo smile",
    "neon hustle aesthetic",
    "oversaturated influencer grade",
    "crowded collage",
    "readable fake quotes in frame",
  ];
  if (avoided.includes("lonely-window") || avoided.some((a) => a.includes("window"))) {
    negative.push("person staring out rainy window");
    negative.push("lonely window silhouette cliché");
  }

  return {
    visual_concept: `${pick.tag}: ${pick.subject}`,
    visual_rationale: `Starts from the insight's pressure (${emotion}) and metaphor (${metaphor}), not from a default sad aesthetic. Universe ${universe} chosen to avoid overused motifs: ${avoided.join(", ") || "none"}.`,
    composition: pick.composition,
    subject: pick.subject,
    environment: pick.environment,
    mood: `unsentimental ${emotion}; clear, human, not theatrical`,
    lighting,
    camera_language: camera,
    text_safe_area: "upper third / left margin kept quiet for overlay",
    generation_prompt,
    negative_constraints: negative,
    universe,
    metaphor,
    palette:
      universe === "renaissance_chiaroscuro"
        ? ["ivory", "umber", "lamp-black", "warm flesh"]
        : universe === "symbolic_surrealism"
          ? ["desaturated teal", "bone", "oxide red accent"]
          : ["stone", "graphite", "soft white"],
    motif_tags: [pick.tag],
    metadata: { source: "fixture-visual-director" },
  };
}


export const fixtureProvider: ProviderAdapter = {
  name: "fixture",
  mode: "fixture",

  async generateStructured<T = unknown>(opts: GenerateStructuredOpts): Promise<T> {
    const key = opts.fixtureKey ?? opts.schemaName ?? "default";
    const ctx = opts.context ?? {};

    if (key === "insight-scout" || key === "scout-candidates") {
      const area = String(ctx.taxonomyArea ?? ctx.area ?? "SELF");
      const min = Number(ctx.min ?? 5);
      const max = Number(ctx.max ?? 30);
      const requested = Number(ctx.count ?? 8);
      const count = Math.min(max, Math.max(min, requested));
      const memoryHints = Array.isArray(ctx.memoryHints)
        ? (ctx.memoryHints as string[])
        : [];
      const pageGoals = Array.isArray(ctx.pageGoals)
        ? (ctx.pageGoals as string[])
        : undefined;
      const candidates = expandCandidates(area, count, memoryHints, pageGoals);
      return { candidates } as T;
    }

    if (key === "concept-architect" || key === "concepts") {
      return { concepts: conceptsFromInsight(ctx) } as T;
    }

    if (key === "writer" || key === "writer-draft") {
      return { draft: writerDraftFromContext(ctx) } as T;
    }

    if (key === "visual-director" || key === "visual-direction") {
      return { direction: visualDirectionFromContext(ctx) } as T;
    }

    if (key === "insight-critic") {
      // Critic uses local heuristics; structured call returns passthrough stub
      return { deferred: true } as T;
    }

    return { ok: true, fixtureKey: key, echo: opts.prompt.slice(0, 120) } as T;
  },

  async generateText(opts: GenerateTextOpts): Promise<string> {
    return `[fixture:${opts.fixtureKey ?? "text"}] ${opts.prompt.slice(0, 200)}`;
  },

  async embed(opts: EmbedOpts): Promise<number[][]> {
    // Deterministic bag-of-tokens embedding (64-d). Paraphrases that share
    // content words land near each other; unrelated conflicts stay distant.
    const DIM = 64;
    const STOP = new Set([
      "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for",
      "is", "are", "was", "were", "be", "been", "being", "it", "that", "this",
      "with", "as", "by", "from", "at", "into", "than", "then", "so", "if",
      "we", "you", "they", "he", "she", "our", "their", "his", "her", "its",
      "not", "no", "yes", "do", "does", "did", "can", "could", "would", "should",
      "have", "has", "had", "will", "just", "about", "over", "under", "more",
      "most", "very", "too", "also", "only", "own", "same", "other", "such",
    ]);
    function tokenize(s: string): string[] {
      return s
        .toLowerCase()
        .replace(/[^a-z0-9\s/-]/g, " ")
        .split(/[\s/-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2 && !STOP.has(t));
    }
    function stem(t: string): string {
      // Light stemmer so postpone/postponed, achieve/achievement share mass
      if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
      if (t.endsWith("tion") && t.length > 6) return t.slice(0, -4);
      if (t.endsWith("ment") && t.length > 6) return t.slice(0, -4);
      if (t.endsWith("ness") && t.length > 6) return t.slice(0, -4);
      if (t.endsWith("ies") && t.length > 5) return t.slice(0, -3) + "y";
      if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
      if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
      if (t.endsWith("s") && t.length > 3) return t.slice(0, -1);
      return t;
    }
    return opts.texts.map((t) => {
      const vec = new Array(DIM).fill(0);
      const tokens = tokenize(t).map(stem);
      for (const tok of tokens) {
        const h = hashSeed(tok);
        vec[h % DIM] += 1;
        vec[(h >>> 8) % DIM] += 0.5;
        vec[(h >>> 16) % DIM] += 0.25;
      }
      // Tiny length prior so empty text isn't NaN later
      if (tokens.length === 0) {
        vec[0] = 1;
      }
      const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
      return vec.map((v: number) => v / norm);
    });
  },

  async generateImage(opts: GenerateImageOpts) {
    return {
      url: `fixture://image/${hashSeed(opts.prompt).toString(16)}`,
      meta: { mode: "fixture", prompt: opts.prompt.slice(0, 80) },
    };
  },
};
