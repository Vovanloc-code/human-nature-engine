# Data Model — Phase 1

## Core tables
| Table | Role |
|-------|------|
| `pages` / `page_dna` | Publication surface + voice/visual/format mix |
| `taxonomy_categories` / `taxonomy_nodes` | Editable conflict taxonomy |
| `human_insights` | Atomic unit |
| `insight_sources` | Provenance |
| `concepts` | Angles derived from insights |
| `content_assets` | Generated content instances |
| `content_genomes` | Structured creative DNA per asset |
| `visual_concepts` / `visual_assets` | Visual direction (Phase 2+) |
| `quality_reviews` / `duplicate_checks` | Scoring & dedup records |
| `content_queue` / `publication_records` | Scheduling & publish log |
| `performance_metrics` | Post-publish metrics |
| `feedback_events` | Human decisions |
| `idea_vault` | Vault tier + tags per insight |
| `prompt_versions` | Prompt registry |
| `agent_runs` / `run_logs` | Auditable runs (`RUN-YYYY-MM-DD-NNN`) |

## Human Insight fields
`statement`, `observation`, `desire`, `hidden_fear`, `contradictory_behavior`, `cost`, `primary_conflict_id`, `secondary_conflicts` (JSONB), scores, `source_type`, `source_reference`, `status`, timestamps.

**Statuses:** `candidate | approved | rejected | used | retired | needs_research`

## Content Genome fields
`primary_conflict`, `secondary_conflicts`, `primary_emotion`, `secondary_emotion`, `audience_wounds`, `lenses`, `tones`, `depth_level`, `structure`, `visual_metaphor`, `ending_type`

## Phase 3 notes
- `content_assets.metadata` holds platform, headline, image_text, caption, cta, language, quality_score, hook, slides, script
- `visual_concepts.metadata` holds visual_rationale, subject, environment, mood, lighting, camera_language, text_safe_area, generation_prompt, negative_constraints, universe, motif tags
- `visual_assets` stub `kind=generation_brief` stores the generation prompt for later image runs

## Phase 4 notes
- `embeddings` — object_type (`human_insight`|`concept`|`content_asset`|`visual_concept`), object_id, kind, model, dims, values (JSONB), embedding `vector(64)`
- `duplicate_checks` — optional content_asset_id / insight_id / compared_*; text/insight/genome/visual similarity columns; details JSONB; verdict `hard_duplicate`|`rewrite_zone`|`acceptable`|`distinct`

## Phase 7 notes
- `preference_weights` — per-page dimension/key weights with evidence_count, approve/reject/favorite/edit counts, confidence; overlay only when evidence ≥ 5
- `performance_metrics` — impressions, reach, likes, comments, shares, saves, follows, link_clicks, dwell_time, video_watch_time, meaningful_comments
- Primary success signals for aggregation/ranking priors: share rate, save rate, follow conversion, meaningful comments, link clicks (not likes alone)
- Page DNA is never mutated by feedback learning

