import { prisma } from "@/db";
import { PROMPT_V1, type PromptAgentKey } from "./bodies";

function fallbackPrompt(agent: string): string {
  return `You are the ${agent} agent for the Human Nature Content Engine. Follow PRODUCT-LAW and PROMPT-LAW. Never generate content without parent Human Insights.`;
}

/**
 * Prompt versioning: never silently overwrite an existing (agent, version) row.
 * Activating a new version deactivates others for that agent.
 */

export async function getActivePrompt(agent: string): Promise<{
  version: string;
  body: string;
  source: "db" | "default";
}> {
  const row = await prisma.promptVersion.findFirst({
    where: { agent, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (row) {
    return { version: row.version, body: row.body, source: "db" };
  }
  const seeded = PROMPT_V1[agent as PromptAgentKey];
  if (seeded) {
    return { version: seeded.version, body: seeded.body, source: "default" };
  }
  return { version: "0.0", body: fallbackPrompt(agent), source: "default" };
}

export async function getPromptVersion(agent: string, version: string) {
  return prisma.promptVersion.findUnique({
    where: { agent_version: { agent, version } },
  });
}

/**
 * Insert a prompt version if missing. Will NOT overwrite an existing body.
 */
export async function ensurePromptVersion(opts: {
  agent: string;
  version: string;
  body: string;
  activate?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean; id: string }> {
  const existing = await prisma.promptVersion.findUnique({
    where: {
      agent_version: { agent: opts.agent, version: opts.version },
    },
  });

  if (existing) {
    if (opts.activate && !existing.isActive) {
      await prisma.$transaction([
        prisma.promptVersion.updateMany({
          where: { agent: opts.agent, isActive: true },
          data: { isActive: false },
        }),
        prisma.promptVersion.update({
          where: { id: existing.id },
          data: { isActive: true },
        }),
      ]);
    }
    return { created: false, id: existing.id };
  }

  if (opts.activate) {
    await prisma.promptVersion.updateMany({
      where: { agent: opts.agent, isActive: true },
      data: { isActive: false },
    });
  }

  const row = await prisma.promptVersion.create({
    data: {
      agent: opts.agent,
      version: opts.version,
      body: opts.body,
      isActive: opts.activate ?? false,
      metadata: (opts.metadata ?? undefined) as any,
    },
  });
  return { created: true, id: row.id };
}

export async function seedPhase2Prompts() {
  const results: Array<{ agent: string; created: boolean }> = [];
  for (const [agent, def] of Object.entries(PROMPT_V1)) {
    const r = await ensurePromptVersion({
      agent,
      version: def.version,
      body: def.body,
      activate: true,
      metadata: { phase: 2, law: "PROMPT-LAW" },
    });
    results.push({ agent, created: r.created });
  }
  return results;
}

/** Seed all known prompt_versions from PROMPT_V1 (Phase 2+3). Idempotent. */
export async function seedPhase3Prompts() {
  return seedPhase2Prompts();
}

/** Phase 4 — includes DedupJudge v1.0 (idempotent via ensurePromptVersion). */
export async function seedPhase4Prompts() {
  return seedPhase2Prompts();
}

/** Phase 5 — includes Editor-in-Chief v1.0 (idempotent). */
export async function seedPhase5Prompts() {
  return seedPhase2Prompts();
}
