# AGENTS.md — Human Nature Content Engine

## Mission
Produce human-nature content from **Human Insights** only. Never generate content without parent insights.

## Ten product laws
1. **Insight-first** — Every piece of content traces to approved Human Insights.
2. **Human truth over motivation** — Prefer uncomfortable recognition over generic uplift.
3. **Conflict is the engine** — Name desire, hidden fear, contradiction, and cost.
4. **Taxonomy is editable truth** — Conflicts live in DB tables.
5. **Genome over vibes** — Content carries an explicit creative genome.
6. **Dedup before publish** — Score novelty; judge duplicates.
7. **Feedback is data** — Store approve/reject/edit/favorite/regenerate/publish.
8. **Idea Vault is the inventory** — Track total/approved/unused/used/exceptional/needs_research/rejected/retired.
9. **Runs are auditable** — Log under `RUN-YYYY-MM-DD-NNN`.
10. **Page DNA guides voice** — Topics, voice, visual mix, format mix per page.

## Agents
| Agent | Role | Phase |
|-------|------|-------|
| `insight-scout` | Discover candidate insights (5–30) | **2 live** |
| `insight-critic` | Score & approve/reject (usable+) | **2 live** |
| `concept-architect` | Multiple distinct concepts from one insight | **2 live** |
| `slop-critic` | Hard-reject slop / fake wisdom | **2 live** |
| `writer` | Draft content assets (v0.1 formats) | **3 live** |
| `visual-director` | Visual concepts (meaning-first) | **3 live** |
| `dedup-judge` | Similarity / duplicate verdicts | **4 live** |
| `editor-chief` | Final ranking / shortlist | **5 live** |

## Philosophical lenses
`neutral-humanist`, `stoic`, `buddhist`, `christian`, `renaissance-humanism`, `montaigne`, `machiavellian`, `modern-psychology`, `existential`

## Shared types
See `src/agents/types.ts`.

## Phase 2 surface
- Provider adapter: `src/providers` (fixture default; optional OpenAI/xAI)
- Pipeline: Scout → Critic → Concept Architect (`src/engine/discovery/pipeline.ts`)
- CLI: `npm run pipeline:discover -- --area SELF --concepts`

## Phase 3 surface
- Writer: `src/agents/writer` — Concept → draft + content_asset + genome
- Visual Director: `src/agents/visual-director` — asset → visual_concept + generation prompt
- Pipeline: `src/engine/production/pipeline.ts`
- CLI: `npm run pipeline:produce -- --insight <id>` or `pipeline:discover -- --produce`

## Phase 4 surface
- Dedup Judge: `src/agents/dedup-judge` — TEXT/INSIGHT/GENOME/VISUAL similarities
- Embeddings: `src/engine/embeddings` — provider.embed() + pgvector mirror
- Thresholds: hard ≥0.88, rewrite 0.78–0.87 (env `HNE_DEDUP_HARD` / `HNE_DEDUP_REWRITE`)
- CLI: `npm run dedup:check -- --asset <id> | --insight <id>`
- Production pipeline auto-runs Dedup after Writer → Visual

## Phase 5 surface
- Editor-in-Chief: `src/agents/editor-chief` — 100-pt rubric + WHY_THIS_WAS_SELECTED
- Ranking helpers: `src/engine/ranking/editorial.ts` (Page DNA fit + diversification)
- Daily pipeline: `src/engine/editorial/pipeline.ts`
- CLI: `npm run editor:rank -- --page the-war-within --target 5`
- CLI: `npm run pipeline:today -- --page the-war-within --target 12`
- Persists `quality_reviews`; selected assets → status `reviewing`; Phase 6 UI approves → queue

## Phase 6 surface
- UI App Router: `/today`, `/review/[id]`, `/idea-vault`, `/queue`, `/pages`, `/performance`, `/settings`
- Review workflow: `src/engine/review` — approve→queue, reject/edit/favorite/regenerate→feedback_events
- REST: `/api/today/generate`, `/api/candidates`, `/api/candidates/[id]/action`, `/api/idea-vault/metrics`, `/api/queue`, `/api/pages`
- Dev: `npm run dev` → http://localhost:3000/today (no auth yet)

## Phase 7 surface
- Feedback learning: `src/engine/feedback` — preference_weights from approve/reject/edit/favorite/…
- Evidence threshold N≥5 before overlay; **never** rewrite Page DNA from one action
- Performance: `src/analytics/performance` — ingest + aggregate by conflict/visual/format
- Ranking soft-boost: `src/engine/ranking/learning-overlay` (rankScore only)
- UI: `/performance`, Settings preference weights (read-only)
- REST: `/api/performance/ingest`, `/api/performance/summary`, `/api/preferences`
- CLI: `npm run performance:ingest`

## Phase 8 surface
- Publishers: `src/providers/publishers` — fixture / facebook / instagram / wordpress
- Live Graph/REST only when env credentials present; else dry-run (no secrets leaked)
- Orchestration: `src/engine/publishing` — publication_records + asset published_at + queue + feedback
- CLI: `npm run publish:run -- --queue-id … | --asset … --platform facebook`
- REST: `POST /api/publish`, `GET /api/publish` (publisher status)
- UI: Queue Publish button + Settings publisher configuration status

## Phase 9 surface
- Media providers: `src/providers/media` — fixture real PNG + optional OpenAI Images
- GeneratedMedia + Visual QC: `src/engine/media`, `src/engine/visual-qc`
- Facebook modes: `facebook_text` | `facebook_image` (`src/providers/publishers/facebook`)
- Stage A slice: `npm run phase9:slice -- --page the-war-within` (dry-run FB only)
- Media serve: `GET /api/media/[id]`
- `/today` shows real image preview + Facebook readiness
