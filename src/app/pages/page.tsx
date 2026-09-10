import Link from "next/link";
import { listPages } from "@/engine/review";

export const dynamic = "force-dynamic";

export default async function PagesListPage() {
  const pages = await listPages();

  return (
    <div className="stack">
      <div>
        <h1>Pages</h1>
        <p className="lead">Page DNA guides voice, visuals, and format mix.</p>
      </div>
      <div className="grid grid-2">
        {pages.map((p) => (
          <Link key={p.id} href={`/pages/${p.slug}`} className="card">
            <h3>{p.name}</h3>
            <div className="mono small muted">{p.slug}</div>
            <p className="small muted">{p.description ?? "No description"}</p>
            <span className="badge">
              {p.dna ? "DNA configured" : "No DNA"}
            </span>
          </Link>
        ))}
        {pages.length === 0 && (
          <div className="panel muted">No pages. Run npm run db:seed.</div>
        )}
      </div>
    </div>
  );
}
