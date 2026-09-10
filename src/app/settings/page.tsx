import { getPreferenceSummary } from "@/engine/feedback/preferences";
import { getPublisherStatuses } from "@/engine/publishing";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let preferences: Awaited<ReturnType<typeof getPreferenceSummary>> | null =
    null;
  let prefError: string | null = null;
  try {
    preferences = await getPreferenceSummary({ pageSlug: "the-war-within" });
  } catch (e) {
    prefError = e instanceof Error ? e.message : String(e);
  }

  const publishers = getPublisherStatuses();

  return (
    <div className="stack">
      <h1>Settings</h1>
      <p className="lead">
        Single-user — no auth yet. Provider and thresholds via env. Preference
        weights are read-only here (Phase 7 learning memory). Publishers show
        whether live credentials are present (values never displayed).
      </p>
      <div className="panel stack">
        <div>
          <div className="muted small">Provider</div>
          <div className="mono">
            HNE_PROVIDER={process.env.HNE_PROVIDER ?? "fixture (default)"}
          </div>
        </div>
        <div>
          <div className="muted small">Database</div>
          <div className="mono small">
            {process.env.DATABASE_URL
              ? "DATABASE_URL configured"
              : "DATABASE_URL missing"}
          </div>
        </div>
      </div>

      <div className="panel stack">
        <h2>Publishers</h2>
        <p className="muted small">
          Live Graph/REST only when required env keys are set; otherwise
          dry-run/fixture. Secrets are never shown.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Configured</th>
                <th>Mode</th>
                <th>Required env</th>
                <th>Present</th>
              </tr>
            </thead>
            <tbody>
              {publishers.map((p) => (
                <tr key={p.platform}>
                  <td className="mono">{p.platform}</td>
                  <td>{p.configured ? "yes" : "no"}</td>
                  <td>
                    <span className="badge">{p.mode}</span>
                  </td>
                  <td className="mono small">
                    {p.requiredEnv.length ? p.requiredEnv.join(", ") : "—"}
                  </td>
                  <td className="mono small">
                    {p.presentEnv.length ? p.presentEnv.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel stack">
        <h2>Preference weights (read-only)</h2>
        {prefError && <p className="muted">{prefError}</p>}
        {preferences && (
          <>
            <p className="muted small">
              Threshold N≥{preferences.threshold} before overlay.{" "}
              {preferences.note}
            </p>
            {preferences.weights.length === 0 ? (
              <p className="muted small">No preference weights stored yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Key</th>
                      <th>Weight</th>
                      <th>Evidence</th>
                      <th>Confidence</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preferences.weights.map((w) => (
                      <tr key={w.id}>
                        <td className="mono small">{w.dimension}</td>
                        <td className="mono small">{w.key}</td>
                        <td>{w.weight.toFixed(3)}</td>
                        <td>{w.evidenceCount}</td>
                        <td>{w.confidence.toFixed(2)}</td>
                        <td>
                          {w.evidenceCount >= preferences.threshold
                            ? "yes"
                            : "no"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
