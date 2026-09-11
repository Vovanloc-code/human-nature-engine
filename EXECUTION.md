# EXECUTION.md — Living status

## Current phase
**Phase 9 — LIVE VERTICAL SLICE: COMPLETE (Stage A — dry-run)**  
Waiting: **APPROVE LIVE TEST** before any live Facebook publish.

## Top-level status (Phases 1–9)

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
| 9 | Live vertical slice (image gen + visual QC + FB image dry-run) | **COMPLETE (Stage A)** |

### v0.1 acceptance checklist
- [x] Generate path exists via UI (`/today` → generate) and API (`POST /api/today/generate`)
- [x] Insight-first production → review → queue → publish (fixture) path
- [x] Dedup before publish (Phase 4) + editorial ranking (Phase 5)
- [x] Feedback + preference learning without rewriting Page DNA (Phase 7)
- [x] Publication connectors architecture with working fixture / dry-run path (Phase 8)
- [x] Live FB/IG/WP gated on env credentials (no hard-coded secrets)
- [x] Real image generation path (fixture PNG file always; live OpenAI Images when `OPENAI_API_KEY`)
- [x] GeneratedMedia first-class provenance + Visual QC gate (queue only PASS when media present)
- [x] Facebook `facebook_image` dry-run payload (Stage A — no auto live publish)
- [ ] Auth (deferred — single-user)
- [ ] Fully automatic live publishing without credentials (explicitly out of scope for v0.1)
- [ ] **Stage A APPROVE LIVE TEST** (human gate before live FB)

## Completed work

### Phase 1–8 (still green)
See prior sections; **vitest Phases 1–8: 43/43** remain green.

### Phase 9 — Live vertical slice
- [x] Media generation provider layer (`src/providers/media`) — fixture writes **real PNG files**; live OpenAI Images when `OPENAI_API_KEY` present; never claims live success without a readable file
- [x] `GeneratedMedia` table + VisualAsset provenance columns (migration `20260911090000_phase9_generated_media`)
- [x] Wire Visual Director → Image Provider → GeneratedMedia → Visual QC → Content Asset
- [x] Visual QC gate: dimensions/aspect, file readable, no placeholder, failure signals, concept match, text-safe, motif overuse, Page DNA fit, visual dedup, content/visual agreement → `PASS|REGENERATE|REJECT`
- [x] Approve→queue blocked when media exists and QC ≠ PASS
- [x] Facebook publishers: `facebook_text` (/feed) + `facebook_image` (Graph `/photos`); dry-run image payload without credentials; idempotent duplicate prevention
- [x] Stage A CLI: `npm run phase9:slice -- --page the-war-within` → preview package JSON + image, **Facebook DRY RUN only**
- [x] `/today` control surface: insight, why it matters, copy, **actual image preview** (`/api/media/[id]`), editor/slop/visual QC scores, WHY SELECTED, queue status, Facebook readiness
- [x] **vitest Phase 9: 10/10** (total **53/53**)
- [x] Real content day (fixture-safe): ran Stage A for `the-war-within` with real PNGs + ranked shortlist; LIVE_LLM / LIVE_IMAGE documented as blocked without keys

#### Gaps closed (from audit)
| Gap | Status |
|-----|--------|
| A. IMAGE_GENERATION=MISSING | **CLOSED** — real files under `storage/generated/` (fixture) or downloaded live |
| B. FACEBOOK_IMAGE_PUBLISH=MISSING | **CLOSED** — `facebook_image` mode + dry-run |
| C. LIVE_LLM=NEVER_EXERCISED | **GATED** — fixture kept for tests; live path when keys exist (Stage A waiting APPROVE LIVE TEST) |
| D. MEDIA_PROVENANCE=PARTIAL | **CLOSED** — first-class `generated_media` columns |

#### Credential classes needed (names only — never paste values)
- `OPENAI_API_KEY` — live LLM + live image generation
- `OPENAI_IMAGE_MODEL` — optional (default `dall-e-3`)
- `FACEBOOK_PAGE_ACCESS_TOKEN` — live Facebook publish
- `FACEBOOK_PAGE_ID` — live Facebook publish
- Optional: `XAI_API_KEY`, `HNE_IMAGE_PROVIDER`, `HNE_MEDIA_DIR`

#### Stage A status
**WAITING: APPROVE LIVE TEST** before enabling live Facebook publish.  
Dry-run path is green. Do **not** auto-publish live.

## Open issues
- Live LLM / live image untested in this environment (no API keys in `.env`)
- Live FB requires APPROVE LIVE TEST + credentials
- Parent must push branch to GitHub (do not push from this agent)
- Auth still deferred (single-user)

## Decisions
- Fixture provider remains default for CI (`HNE_PROVIDER=fixture`)
- Image provider defaults to fixture when no `OPENAI_API_KEY` / forced fixture — writes real PNG bytes (not `fixture://` fake URLs)
- Visual QC PASS required to queue **when** generated media exists (legacy text-only approve still works without media)
- Facebook image posts use Graph Page `/photos` with caption; text remains `/feed`
- Idempotent publish: duplicate prevention per asset+platform(+facebook publishMode)
- Preference learning remains a weighted overlay, never a Page DNA rewrite
- Postgres remains on host **:5433**
- Never hard-code publishing secrets; document only in `.env.example`

## Artifacts
- Preview package: `artifacts/phase9/preview-latest.json` (gitignored runtime)
- Sample committed PNG: `storage/generated/fixture-sample.png`
- CLI: `npm run phase9:slice -- --page the-war-within [--fixture]`

## Test status
**PASS — 2026-09-11 01:45 UTC (2026-09-11 08:45 Asia/Saigon)**

```
 ✓ tests/phase9.test.ts (10 tests)
 ✓ tests/phase8.test.ts (4 tests)
 … Phases 1–7 …
 Test Files  9 passed (9)
      Tests  53 passed (53)
```

**Build:** `npm run build` PASS (Next.js 15) — includes `/api/media/[id]`.
