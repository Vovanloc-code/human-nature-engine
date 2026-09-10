# Prompt Law

## Rules for all agents
1. Never invent a Human Insight mid-generation — load from DB or fail.
2. Cite `insight_id` in every concept/content output.
3. Prefer specificity and contradiction over slogans.
4. Respect Page DNA (voice, forbidden tones, visual mix).
5. Version prompts in `prompt_versions`; never silently change production prompts.
6. Log every run under `RUN-YYYY-MM-DD-NNN` with input/output summaries.
7. Slop critic must reject generic motivation and recycled metaphors without new conflict angle.
8. Dedup judge compares statement embeddings / lexical similarity before queue approval.
9. Philosophical lenses change interpretation; never fabricate quotations.
10. Fixture/deterministic provider is the CI default; live LLM only when keys present.

## Prompt versions (Phase 2)
Seeded agents with v1.0 bodies:
- `insight-scout`
- `insight-critic`
- `concept-architect`
- `slop-critic`

Use `ensurePromptVersion()` — existing `(agent, version)` rows are never overwritten.
Activate explicitly; activating one version deactivates others for that agent.

```bash
npm run prompts:seed
```
