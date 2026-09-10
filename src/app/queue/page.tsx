import Link from "next/link";
import { listQueue } from "@/engine/review";
import { QueuePublishControls } from "@/components/QueuePublishControls";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const items = await listQueue({ status: sp.status, limit: 100 });

  return (
    <div className="stack">
      <div>
        <h1>Content Queue</h1>
        <p className="lead">
          Approved items entering the publish pipeline. Statuses: draft /
          reviewing / rejected / approved / queued / published / archived.
          Use Publish to push via fixture or live connectors (Phase 8).
        </p>
      </div>

      <div className="row">
        {[
          "",
          "queued",
          "approved",
          "published",
          "draft",
          "reviewing",
          "rejected",
          "archived",
        ].map((s) => (
          <Link
            key={s || "all"}
            className="btn btn-sm"
            href={s ? `/queue?status=${s}` : "/queue"}
          >
            {s || "all"}
          </Link>
        ))}
      </div>

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Page</th>
              <th>Title</th>
              <th>Conflict</th>
              <th>Asset</th>
              <th>Publish</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.position}</td>
                <td>
                  <span className="badge">{item.status}</span>
                </td>
                <td>{item.page?.name ?? "—"}</td>
                <td>
                  {item.contentAsset ? (
                    <Link href={`/review/${item.contentAsset.id}`}>
                      {item.contentAsset.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="mono small">
                  {item.contentAsset?.genome?.primaryConflict ??
                    item.contentAsset?.concept?.insight?.primaryConflictId ??
                    "—"}
                </td>
                <td>
                  <span className="badge">
                    {item.contentAsset?.status ?? "—"}
                  </span>
                </td>
                <td>
                  <QueuePublishControls
                    queueId={item.id}
                    contentAssetId={item.contentAssetId}
                    disabled={item.status === "published"}
                  />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Queue empty. Approve candidates from Today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
