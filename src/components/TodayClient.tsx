"use client";

import { useCallback, useEffect, useState } from "react";
import { CandidateCardView, type CandidateCardData } from "./CandidateCard";

type PageRow = {
  id: string;
  slug: string;
  name: string;
};

export function TodayClient({ initialPages }: { initialPages: PageRow[] }) {
  const [pages] = useState(initialPages);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of initialPages) {
      init[p.slug] = p.slug === "the-war-within";
    }
    if (!Object.values(init).some(Boolean) && initialPages[0]) {
      init[initialPages[0].slug] = true;
    }
    return init;
  });
  const [target, setTarget] = useState(5);
  const [depth, setDepth] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateCardData[]>([]);

  const activeSlug =
    Object.entries(selected).find(([, v]) => v)?.[0] ?? "the-war-within";

  const refreshCandidates = useCallback(async () => {
    const res = await fetch(
      `/api/candidates?status=reviewing&page=${encodeURIComponent(activeSlug)}`
    );
    const data = await res.json();
    if (res.ok) setCandidates(data.candidates ?? []);
  }, [activeSlug]);

  useEffect(() => {
    refreshCandidates().catch(() => undefined);
  }, [refreshCandidates]);

  async function generate() {
    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const pageSlugs = Object.entries(selected)
        .filter(([, v]) => v)
        .map(([slug]) => slug);
      if (pageSlugs.length === 0) {
        throw new Error("Select at least one active page");
      }
      const res = await fetch("/api/today/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageSlug: pageSlugs[0],
          pageSlugs,
          target,
          depth,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      setCandidates(data.candidates ?? []);
      setMeta(
        `Run ${data.runId} · pool ${data.poolSize} · produced ${data.produced} · shortlist ${data.shortlist?.length ?? 0}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Today</h1>
        <p className="lead">
          Daily editorial shortlist — generate, review, approve into the queue.
        </p>
      </div>

      <section className="panel stack">
        <h2>Active pages</h2>
        <div className="stack">
          {pages.length === 0 && (
            <div className="muted">No pages seeded. Run npm run db:seed.</div>
          )}
          {pages.map((p) => (
            <label key={p.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={!!selected[p.slug]}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [p.slug]: e.target.checked }))
                }
              />
              <span>
                {p.name}{" "}
                <span className="muted mono small">({p.slug})</span>
              </span>
            </label>
          ))}
        </div>

        <div className="row">
          <label className="field">
            <span>Content target</span>
            <input
              type="number"
              min={1}
              max={30}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 1)}
              style={{ width: 100 }}
            />
          </label>
          <label className="field">
            <span>Depth</span>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="light">Light</option>
              <option value="balanced">Balanced</option>
              <option value="deep">Deep</option>
            </select>
          </label>
          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={generate}
            >
              {loading ? "GENERATING…" : "GENERATE TODAY"}
            </button>
          </div>
        </div>
        {meta && <div className="small muted">{meta}</div>}
        {error && <div className="err small">{error}</div>}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Candidates</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => refreshCandidates()}
          >
            Refresh
          </button>
        </div>
        {candidates.length === 0 ? (
          <div className="panel muted">
            No reviewing candidates yet. Hit GENERATE TODAY.
          </div>
        ) : (
          <div className="grid grid-2">
            {candidates.map((c) => (
              <CandidateCardView
                key={c.id}
                candidate={c}
                onChanged={refreshCandidates}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
