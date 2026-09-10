# EXECUTION.md — Living status

## Current phase
**Phase 8 — Distribution: COMPLETE** (connector architecture + fixture path; live APIs gated on env)

## Top-level status (Phases 1–8)

| Phase | Focus | Status |
|-------|--------|--------|
| 1 | Foundation (schema, taxonomy, Idea Vault, page DNA) | COMPLETE |
| 2 | Intelligence (scout/critic/architect/slop + providers) | COMPLETE |
| 3 | Production (writer + visual director) | COMPLETE |
| 4 | Memory / dedup (embeddings + Dedup Judge) | COMPLETE |
| 5 | Editorial (Editor-in-Chief + daily pipeline) | COMPLETE |
| 6 | UI / review / queue | COMPLETE |
| 7 | Learning (preferences + performance overlays) | COMPLETE |
| 8 | Distribution (publish connectors + records) | COMPLETE |

### v0.1 acceptance checklist
- [x] Generate path exists via UI (`/today` → generate) and API (`POST /api/today/generate`)
- [x] Insight-first production → review → queue → publish (fixture) path
- [x] Dedup before publish (Phase 4) + editorial ranking (Phase 5)
- [x] Feedback + preference learning without rewriting Page DNA (Phase 7)
- [x] Publication connectors architecture with working fixture / dry-run path (Phase 8)
- [x] Live FB/IG/WP gated on env credentials (no hard-coded secrets)
- [ ] Auth (deferred — single-user)
- [ ] Fully automatic live publishing without credentials (explicitly out of scope for v0.1)

## Completed work

### Phase 1 (still green)
- [x] Project scaffold, Prisma schema, taxonomy + 101 insights, Idea Vault, page DNA
- [x] Engine helpers, CLI insights create/search, REST `/api/insights`
- [x] **vitest Phase 1: 8/8**

### Phase 2 (still green)
- [x] Provider adapter (fixture default; optional OpenAI / xAI)
- [x] Philosophical lenses (9)
- [x] A1 Insight Scout, A2 Insight Critic, A3 Concept Architect, A6 Slop Critic
- [x] Prompt versioning; discovery pipeline + CLI
- [x] **vitest Phase 2: 6/6**

### Phase 3 (still green)
- [x] A4 Writer + A5 Visual Director; production pipeline; CLI `pipeline:produce`
- [x] **vitest Phase 3: 4/4**

### Phase 4 (still green)
- [x] A7 Dedup Judge — TEXT / INSIGHT / GENOME / VISUAL similarities
- [x] Embeddings + pgvector; production auto-dedup; CLI `dedup:check`
- [x] **vitest Phase 4: 6/6**

### Phase 5 (still green)
- [x] A8 Editor-in-Chief — final 100-pt ranking + WHY_THIS_WAS_SELECTED
- [x] Daily pipeline `pipeline:today`; CLI `editor:rank`
- [x] **vitest Phase 5: 6/6**

### Phase 6 (still green)
- [x] App shell nav + TODAY / Review / Idea Vault / Queue / Pages UI
- [x] Review actions → `content_queue` + `feedback_events`
- [x] **vitest Phase 6: 5/5**

### Phase 7 (still green)
- [x] `preference_weights` + performance ingest + ranking soft-boost
- [x] Publication record hooks prepared for Phase 8
- [x] **vitest Phase 7: 4/4**

### Phase 8
- [x] Publisher adapters: `fixture`, `facebook`, `instagram`, `wordpress` under `src/providers/publishers`
- [x] Abstract `publish(asset, page, options) => { externalId, url, raw }` (+ mode)
- [x] Live Graph/WP REST only when env credentials present; else dry-run/fixture (no secret leakage)
- [x] Orchestration: `publication_records` + asset `status=published` + `published_at` + queue update + `feedback_events` publish
- [x] Multi-platform records for the same asset
- [x] CLI `npm run publish:run`; API `POST /api/publish` + `GET /api/publish`
- [x] Queue UI Publish button (platform select); Settings shows publisher configuration status
- [x] Env vars documented in `.env.example`
- [x] **vitest Phase 8: 4/4** (total **43/43** with Phases 1–7)

## Open issues
- Live LLM / live embed path untested without keys (by design)
- Live FB/IG/WP paths require real credentials (gated; dry-run without them)
- Parent must push to GitHub (do not push from this agent)
- Auth still deferred (single-user)

## Decisions
- Fixture provider remains default for CI (`HNE_PROVIDER=fixture`)
- Publisher default for tests / missing keys: fixture or platform dry-run
- Preference learning is a **weighted overlay**, never a Page DNA rewrite
- Soft boosts never rescue candidates below editor QC floor / hard dedup fails
- Evidence threshold default **N≥5** (`EVIDENCE_THRESHOLD`)
- Postgres remains on host **:5433**
- Never hard-code publishing secrets; document only in `.env.example`

## Test status
**PASS — 2026-09-10 04:27 UTC (2026-09-10 11:27 Asia/Saigon)**

```
 ✓ tests/phase8.test.ts (4 tests)
 ✓ tests/phase7.test.ts (4 tests)
 ✓ tests/phase6.test.ts (5 tests)
 ✓ tests/phase5.test.ts (6 tests)
 ✓ tests/phase4.test.ts (6 tests)
 ✓ tests/phase3.test.ts (4 tests)
 ✓ tests/phase2.test.ts (6 tests)
 ✓ tests/phase1.test.ts (8 tests)
 Test Files  8 passed (8)
      Tests  43 passed (43)
```

Phase 8 coverage:
1. Fixture publish → publication_record + asset published (+ published_at) + feedback
2. Queue item publish flow (+ API)
3. Missing live credentials → safe dry-run (no secret leakage)
4. Multi-platform publication_records for same asset
5. Phases 1–7 still pass (39 prior + 4 new = 43)


## Exact commands
```bash
cd /workspace/human-nature-engine
export DOCKER_HOST=tcp://127.0.0.1:2375
export PATH="/workspace/bin:$PATH"
export HNE_PROVIDER=fixture   # CI / no keys

docker compose up -d
npm install
npx prisma migrate deploy
npm run db:seed
npm run prompts:seed
npm test

# UI
npm run dev
# open http://localhost:3000/queue  (Publish button)
# open http://localhost:3000/settings  (publisher status)

# Publish
npm run publish:run -- --queue-id <id> --platform fixture
npm run publish:run -- --asset <id> --platform facebook
# (facebook/instagram/wordpress dry-run without credentials)

# Prior CLI
npm run performance:ingest -- --asset <id> --fixture
npm run pipeline:today -- --page the-war-within --target 12
```

Optional live publishers (not required for tests):
```bash
export FACEBOOK_PAGE_ACCESS_TOKEN=...
export FACEBOOK_PAGE_ID=...
export INSTAGRAM_ACCESS_TOKEN=...
export INSTAGRAM_BUSINESS_ACCOUNT_ID=...
export WP_URL=https://example.com
export WP_USERNAME=...
export WP_APP_PASSWORD=...
```

Optional live LLM providers (not required for tests):
```bash
export HNE_PROVIDER=auto   # or openai / xai
export OPENAI_API_KEY=...
```

## Parent push
Do **not** `git push` from this agent. Parent handles GitHub upload for `Vovanloc-code/human-nature-engine` (exclude `node_modules`, `.next`, `.env`).
