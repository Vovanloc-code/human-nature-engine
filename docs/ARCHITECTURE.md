# Architecture

## Stack
- **Next.js App Router** (TypeScript) — UI + REST API
- **PostgreSQL 16 + pgvector** via Docker Compose
- **Prisma ORM** — schema, migrate, seed
- **Vitest** — integration tests
- **CLI** (`tsx`) — insights + discovery pipeline
- **Provider adapter** — fixture (CI) / optional live OpenAI or xAI

## Layout
```
src/app/          Next.js UI (Today/Review/Vault/Queue/Pages) + REST APIs
src/agents/       Agents (scout→architect+slop Phase 2; writer+visual Phase 3)
src/providers/    generateStructured / generateText / embed / generateImage
src/lenses/       Philosophical lens definitions
src/prompts/      Prompt bodies + DB versioning helpers
src/engine/       Core helpers (discovery pipeline, concepts, generation, …)
src/db/           Prisma client
src/cli/          CLI entrypoints
prisma/           Schema + seed
```

## Data flow (Phase 2 intelligence)
1. **Insight Scout** discovers candidates from taxonomy area + memory + page goals
2. **Insight Critic** scores (100-pt rubric); only usable+ continue
3. Persist approved insights
4. **Concept Architect** expands one approved insight into diverse concepts
5. **Slop Critic** hard-rejects slogans / false attribution / AI slop
6. All steps log under `agent_runs` / `run_logs`

## Data flow (Phase 3 production)
1. Approved Concept (from Architect or seeded)
2. **Writer** → draft fields + `content_assets` (draft) + `content_genomes`
3. **Visual Director** → `visual_concepts` (+ `visual_assets` generation_brief stub)
4. CLI: `pipeline:produce` or `pipeline:discover --produce`

## Data flow (Phase 4 memory)
1. Embed insights / concepts / content assets / visual concepts via `provider.embed()`
2. Store in `embeddings` (Json + pgvector)
3. **Dedup Judge** after production (and optionally after scout) → `duplicate_checks`
4. CLI: `dedup:check`


## Data flow (Phase 5 editorial)
1. Gather draft/reviewing assets (or produce more via production pipeline)
2. **Editor-in-Chief** scores (100-pt) + Page DNA fit + diversify vs recent memory
3. Return shortlist (best + alternates); rejects keep honest scores
4. Persist `quality_reviews` + mark selected `reviewing`
5. CLI: `editor:rank` / `pipeline:today`


## Data flow (Phase 6 UI)
1. TODAY → `POST /api/today/generate` → editorial pipeline shortlist (reviewing)
2. Human actions on candidate → `POST /api/candidates/[id]/action`
3. Approve → `feedback_events` + `content_queue` (queued); Reject → feedback + rejected
4. Idea Vault metrics / Pages DNA editable without CLI

## Data flow (Phase 7 learning)
1. Human feedback_events → preference_weights (evidence + confidence)
2. Performance metrics ingest → aggregate by genome dimensions
3. Editor/today ranking applies preference + performance soft boosts to rankScore only
4. Overlay inactive until evidence ≥ threshold; Page DNA unchanged


## Data flow (Phase 8 distribution)
1. Queue / asset → publisher adapter (`fixture` | `facebook` | `instagram` | `wordpress`)
2. Live call only if platform credentials present; otherwise dry-run/fixture result
3. Persist `publication_records`; set asset `status=published` + `published_at`
4. Update matching `content_queue` rows; write `feedback_events` action `publish`
5. CLI `publish:run` / `POST /api/publish` / Queue UI Publish button

## Infrastructure
```bash
docker compose up -d          # postgres on :5433
npx prisma migrate deploy
npm run db:seed               # taxonomy + insights + prompt_versions
npm test                      # vitest Phase 1–8
npm run dev                   # UI on :3000
npm run pipeline:discover -- --area SELF --concepts
npm run pipeline:produce -- --insight <id>
```
