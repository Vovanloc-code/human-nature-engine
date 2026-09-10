import { getPerformanceSummary } from "@/analytics/performance";
import { getPreferenceSummary } from "@/engine/feedback/preferences";

export const dynamic = "force-dynamic";

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function BucketTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    assetCount: number;
    impressions: number;
    shareRate: number | null;
    saveRate: number | null;
    followConversion: number | null;
    linkClickRate: number | null;
    meaningfulCommentRate: number | null;
    primaryScore: number;
    likes: number;
  }>;
}) {
  return (
    <div className="panel stack">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted small">No ingested metrics yet for this dimension.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Assets</th>
                <th>Impr.</th>
                <th>Share</th>
                <th>Save</th>
                <th>Follow</th>
                <th>Link</th>
                <th>Meaningful</th>
                <th>Primary</th>
                <th className="muted">Likes*</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="mono small">{r.key}</td>
                  <td>{r.assetCount}</td>
                  <td>{Math.round(r.impressions)}</td>
                  <td>{pct(r.shareRate)}</td>
                  <td>{pct(r.saveRate)}</td>
                  <td>{pct(r.followConversion)}</td>
                  <td>{pct(r.linkClickRate)}</td>
                  <td>{pct(r.meaningfulCommentRate)}</td>
                  <td>{r.primaryScore.toFixed(3)}</td>
                  <td className="muted">{Math.round(r.likes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function PerformancePage() {
  const pageSlug = "the-war-within";
  let performance: Awaited<ReturnType<typeof getPerformanceSummary>> | null =
    null;
  let preferences: Awaited<ReturnType<typeof getPreferenceSummary>> | null =
    null;
  let error: string | null = null;

  try {
    [performance, preferences] = await Promise.all([
      getPerformanceSummary({ pageSlug }),
      getPreferenceSummary({ pageSlug }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const activePrefs =
    preferences?.weights.filter(
      (w) => w.evidenceCount >= (preferences?.threshold ?? 5)
    ) ?? [];

  return (
    <div className="stack">
      <h1>Performance</h1>
      <p className="lead">
        Phase 7 learning — primary signals are share / save / follow /
        meaningful comments / link clicks. Likes are tracked but not primary.
        Preference weights overlay ranking only after evidence ≥ threshold (
        {preferences?.threshold ?? 5}); Page DNA is never rewritten by feedback.
      </p>

      {error && (
        <div className="panel" style={{ borderColor: "var(--danger)" }}>
          {error}
        </div>
      )}

      {performance && (
        <>
          <div className="grid grid-4">
            <div className="panel">
              <div className="muted small">Assets with metrics</div>
              <div className="stat">{performance.totals.assetCount}</div>
            </div>
            <div className="panel">
              <div className="muted small">Impressions</div>
              <div className="stat">
                {Math.round(performance.totals.impressions)}
              </div>
            </div>
            <div className="panel">
              <div className="muted small">Share rate</div>
              <div className="stat">{pct(performance.totals.shareRate)}</div>
            </div>
            <div className="panel">
              <div className="muted small">Save rate</div>
              <div className="stat">{pct(performance.totals.saveRate)}</div>
            </div>
          </div>

          <BucketTable title="By conflict" rows={performance.byConflict} />
          <BucketTable title="By visual universe" rows={performance.byVisual} />
          <BucketTable title="By format" rows={performance.byFormat} />
        </>
      )}

      <div className="panel stack">
        <h2>Preference summary</h2>
        <p className="muted small">
          {preferences?.note} Active keys (evidence ≥ threshold):{" "}
          {preferences?.activeKeys ?? 0} / {preferences?.totalKeys ?? 0}
        </p>
        {activePrefs.length === 0 ? (
          <p className="muted small">
            No preference keys have crossed the evidence threshold yet.
          </p>
        ) : (
          <ul className="plain-list">
            {activePrefs.slice(0, 24).map((w) => (
              <li key={w.id} className="mono small">
                {w.dimension}/{w.key}: weight {w.weight.toFixed(3)} · evidence{" "}
                {w.evidenceCount} · conf {w.confidence.toFixed(2)} · ±
                {w.approveCount}a/{w.rejectCount}r/{w.favoriteCount}f
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="muted small">
        * Likes shown for context only — not used in primaryScore or ranking soft
        boost.
      </p>
    </div>
  );
}
