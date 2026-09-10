import { getIdeaVaultMetrics } from "@/engine/idea-vault";
import { searchInsights } from "@/engine/discovery/insights";
import { IdeaVaultSearch } from "@/components/IdeaVaultSearch";

export const dynamic = "force-dynamic";

export default async function IdeaVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const metrics = await getIdeaVaultMetrics();
  const insights = await searchInsights({
    q: sp.q,
    status: sp.status as never,
    limit: 40,
  });

  const metricEntries: Array<[string, number]> = [
    ["total", metrics.total],
    ["approved", metrics.approved],
    ["unused", metrics.unused],
    ["used", metrics.used],
    ["exceptional", metrics.exceptional],
    ["needs_research", metrics.needs_research],
    ["rejected", metrics.rejected],
    ["retired", metrics.retired],
  ];

  return (
    <div className="stack">
      <div>
        <h1>Idea Vault</h1>
        <p className="lead">
          Inventory of Human Insights — the only source of content.
        </p>
      </div>

      <div className="grid grid-4">
        {metricEntries.map(([label, value]) => (
          <div key={label} className="metric">
            <div className="label">{label.replace(/_/g, " ")}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <IdeaVaultSearch initialQ={sp.q ?? ""} initialStatus={sp.status ?? ""} />

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Status</th>
              <th>Statement</th>
              <th>Conflict</th>
              <th>Scores</th>
            </tr>
          </thead>
          <tbody>
            {insights.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <span className="badge">{i.status}</span>
                </td>
                <td>{i.statement}</td>
                <td className="mono small">{i.primaryConflictId ?? "—"}</td>
                <td className="small muted">
                  U {i.universalityScore?.toFixed(2) ?? "—"} · D{" "}
                  {i.depthScore?.toFixed(2) ?? "—"}
                </td>
              </tr>
            ))}
            {insights.items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No insights match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted small">
          Showing {insights.items.length} of {insights.total}
        </p>
      </section>
    </div>
  );
}
