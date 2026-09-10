# Human Nature Content Engine

Insight-first content production system. The atomic unit is the **Human Insight**.

## Phase 1
- PostgreSQL + pgvector (Docker)
- Prisma schema for all core tables
- Taxonomy seed (10 categories + subnodes)
- ≥100 human-truth insight seeds + Idea Vault
- Sample page **The War Within** + page DNA
- Engine helpers, CLI, REST API
- Vitest integration tests
- Agent folders stubbed for later phases

## Quick start
```bash
export DOCKER_HOST=tcp://127.0.0.1:2375   # if needed in this environment
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm test
npm run dev
```

## CLI
```bash
npm run insights:create -- --statement "Your insight..." --status approved
npm run insights:search -- --q shame --status approved --limit 10
```

## API
- `GET /api/insights?q=&status=&conflict=&minUniversality=&limit=`
- `POST /api/insights` JSON body matching createInsight fields

## Docs
- `docs/PRODUCT-LAW.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA-MODEL.md`
- `docs/PROMPT-LAW.md`
- `AGENTS.md`
- `EXECUTION.md`
