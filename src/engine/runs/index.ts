import { prisma } from "@/db";
import type { AgentRunStatus } from "@prisma/client";

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function todayUtcDate(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Allocate next RUN-YYYY-MM-DD-NNN id for the UTC day. */
export async function allocateRunId(date = todayUtcDate()): Promise<string> {
  const prefix = `RUN-${date}-`;
  const latest = await prisma.agentRun.findFirst({
    where: { runId: { startsWith: prefix } },
    orderBy: { runId: "desc" },
    select: { runId: true },
  });

  let next = 1;
  if (latest?.runId) {
    const part = latest.runId.slice(prefix.length);
    const num = parseInt(part, 10);
    if (!Number.isNaN(num)) next = num + 1;
  }

  return `${prefix}${pad3(next)}`;
}

export async function startAgentRun(opts: {
  agent: string;
  input?: Record<string, unknown>;
  runId?: string;
}) {
  const runId = opts.runId ?? (await allocateRunId());
  const run = await prisma.agentRun.create({
    data: {
      runId,
      agent: opts.agent,
      status: "running",
      input: (opts.input ?? undefined) as any,
      startedAt: new Date(),
    },
  });
  await appendRunLog(run.id, "info", `Started agent run ${runId}`);
  return run;
}

export async function finishAgentRun(
  agentRunId: string,
  status: AgentRunStatus,
  output?: Record<string, unknown>,
  error?: string
) {
  const run = await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status,
      output: (output ?? undefined) as any,
      error,
      finishedAt: new Date(),
    },
  });
  await appendRunLog(
    agentRunId,
    status === "succeeded" ? "info" : "error",
    `Finished with status=${status}${error ? `: ${error}` : ""}`
  );
  return run;
}

export async function appendRunLog(
  agentRunId: string,
  level: string,
  message: string,
  data?: Record<string, unknown>
) {
  return prisma.runLog.create({
    data: {
      agentRunId,
      level,
      message,
      data: (data ?? undefined) as any,
    },
  });
}

export async function getRunByRunId(runId: string) {
  return prisma.agentRun.findUnique({
    where: { runId },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  });
}
