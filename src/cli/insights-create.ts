#!/usr/bin/env tsx
import { createInsight } from "../engine/discovery/insights";
import { prisma } from "../db";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const statement = arg("statement");
  if (!statement) {
    console.error(
      'Usage: npm run insights:create -- --statement "..." [--status approved] [--conflict SELF/shame]'
    );
    process.exit(1);
  }

  const insight = await createInsight({
    statement,
    observation: arg("observation"),
    desire: arg("desire"),
    hiddenFear: arg("hiddenFear"),
    contradictoryBehavior: arg("contradictoryBehavior"),
    cost: arg("cost"),
    primaryConflictId: arg("conflict"),
    status: (arg("status") as any) ?? "candidate",
    sourceType: "cli",
  });

  console.log(JSON.stringify(insight, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
