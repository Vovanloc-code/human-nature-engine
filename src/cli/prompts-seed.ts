#!/usr/bin/env tsx
import { seedPhase5Prompts } from "../prompts";
import { prisma } from "../db";

async function main() {
  const results = await seedPhase5Prompts();
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
