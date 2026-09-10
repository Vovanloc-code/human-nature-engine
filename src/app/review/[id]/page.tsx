import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandidateDetail } from "@/engine/review";
import { ReviewActions } from "@/components/ReviewActions";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail;
  try {
    detail = await getCandidateDetail(id);
  } catch {
    notFound();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted small" style={{ margin: 0 }}>
            <Link href="/today">← Today</Link>
          </p>
          <h1>{detail.title}</h1>
          <p className="lead">
            {detail.page?.name ?? "—"} · {detail.format}
            {detail.primaryConflict ? ` · ${detail.primaryConflict}` : ""} ·{" "}
            <span className="badge">{detail.status}</span>
            {detail.score != null && (
              <>
                {" "}
                · score <strong>{detail.score.toFixed(0)}</strong>
              </>
            )}
          </p>
        </div>
      </div>

      <ReviewActions contentAssetId={detail.id} />

      <div className="grid grid-2">
        <section className="panel stack">
          <h2>Human Insight</h2>
          {detail.humanInsight ? (
            <>
              <p>{detail.humanInsight.statement}</p>
              <div className="small muted">
                Desire: {detail.humanInsight.desire ?? "—"}
                <br />
                Hidden fear: {detail.humanInsight.hiddenFear ?? "—"}
                <br />
                Contradiction:{" "}
                {detail.humanInsight.contradictoryBehavior ?? "—"}
                <br />
                Cost: {detail.humanInsight.cost ?? "—"}
              </div>
            </>
          ) : (
            <p className="muted">No insight linked</p>
          )}
        </section>

        <section className="panel stack">
          <h2>Concept</h2>
          {detail.concept ? (
            <>
              <p>
                <strong>{detail.concept.title}</strong>
              </p>
              <div className="small muted">
                Angle: {detail.concept.angle ?? "—"}
                <br />
                Hook: {detail.concept.hook ?? "—"}
                <br />
                Thesis: {detail.concept.thesis ?? "—"}
              </div>
            </>
          ) : (
            <p className="muted">No concept</p>
          )}
        </section>

        <section className="panel stack">
          <h2>Genome</h2>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(detail.genome, null, 2) ?? "null"}
          </pre>
        </section>

        <section className="panel stack">
          <h2>Image Text</h2>
          <p className="mono">{detail.imageText ?? "—"}</p>
          <h2>Caption</h2>
          <p>{detail.caption ?? "—"}</p>
          <h2>Hook / Body</h2>
          <p className="small">{detail.hook ?? "—"}</p>
          <p className="small muted">{detail.body ?? ""}</p>
        </section>

        <section className="panel stack">
          <h2>Visual Concept</h2>
          <div className="visual-ph">
            {detail.visualConcept?.title ?? "Visual preview placeholder"}
          </div>
          <div className="small muted">
            Metaphor: {detail.visualConcept?.metaphor ?? "—"}
            <br />
            Style: {detail.visualConcept?.style ?? "—"}
            <br />
            Composition: {detail.visualConcept?.composition ?? "—"}
          </div>
          <h2>Image Prompt</h2>
          <p className="mono small">
            {detail.visualConcept?.generationPrompt ?? "—"}
          </p>
        </section>

        <section className="panel stack">
          <h2>Quality Scores</h2>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(detail.qualityScores, null, 2) ?? "—"}
          </pre>
          <h2>Duplicate Report</h2>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(detail.duplicateReport, null, 2) ?? "—"}
          </pre>
          <h2>Why Selected</h2>
          <p>{detail.whySelected ?? "—"}</p>
          {detail.similarityWarning && (
            <p className="warn-text small">⚠ {detail.similarityWarning}</p>
          )}
        </section>
      </div>

      <details className="panel advanced">
        <summary>Advanced</summary>
        <pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(detail.advanced, null, 2)}
        </pre>
      </details>
    </div>
  );
}
