"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type CandidateCardData = {
  id: string;
  title: string;
  status: string;
  format: string;
  score: number | null;
  verdict: string | null;
  whySelected: string | null;
  page: { id: string; slug: string; name: string } | null;
  seriesOrType: string;
  primaryConflict: string | null;
  imageText: string | null;
  caption: string | null;
  hook: string | null;
  visualPreview: {
    title: string | null;
    metaphor: string | null;
    style: string | null;
    placeholder: boolean;
    imageUrl?: string | null;
    generatedMediaId?: string | null;
    qcStatus?: string | null;
    qcVerdict?: string | null;
  };
  similarityWarning: string | null;
  humanInsightSummary?: string | null;
  whyItMatters?: string | null;
  facebookReadiness?: {
    ready: boolean;
    reasons: string[];
    publishMode: string;
  };
  queueStatus?: string | null;
  slopScore?: number | null;
  editorScore?: number | null;
  visualQcScore?: number | null;
};

const ACTIONS = [
  { id: "approve", label: "APPROVE", className: "btn btn-ok btn-sm" },
  { id: "edit", label: "EDIT", className: "btn btn-sm", href: true },
  { id: "regenerate", label: "REGENERATE", className: "btn btn-sm" },
  { id: "copy", label: "COPY", className: "btn btn-ghost btn-sm" },
  { id: "regenerate_visual", label: "REGENERATE VISUAL", className: "btn btn-sm" },
  { id: "save_for_later", label: "SAVE FOR LATER", className: "btn btn-sm" },
  { id: "reject", label: "REJECT", className: "btn btn-danger btn-sm" },
] as const;

export function CandidateCardView({
  candidate,
  onChanged,
}: {
  candidate: CandidateCardData;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function runAction(action: string) {
    if (action === "edit") {
      router.push(`/review/${candidate.id}`);
      return;
    }
    if (action === "copy") {
      const text = [
        candidate.title,
        candidate.imageText,
        candidate.caption,
        candidate.hook,
      ]
        .filter(Boolean)
        .join("\n\n");
      try {
        await navigator.clipboard.writeText(text);
        setMsg("Copied to clipboard");
      } catch {
        setMsg("Copy failed — open review to select text");
      }
      await fetch(`/api/candidates/${candidate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy" }),
      }).catch(() => undefined);
      return;
    }

    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setMsg(`${action.replace(/_/g, " ")} ✓`);
      onChanged?.();
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const imgUrl = candidate.visualPreview.imageUrl;

  return (
    <article className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="score">
          {candidate.score != null ? candidate.score.toFixed(0) : "—"}
        </div>
        <div className="row">
          {candidate.verdict && (
            <span className="badge ok">{candidate.verdict}</span>
          )}
          <span className="badge">{candidate.status}</span>
          {candidate.queueStatus && (
            <span className="badge">queue:{candidate.queueStatus}</span>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 4 }}>{candidate.title}</h3>
        <div className="muted small">
          {candidate.page?.name ?? "No page"} · {candidate.seriesOrType}
          {candidate.primaryConflict ? ` · ${candidate.primaryConflict}` : ""}
        </div>
      </div>

      {candidate.humanInsightSummary && (
        <div>
          <div className="muted small">Human Insight</div>
          <div className="small">{candidate.humanInsightSummary}</div>
        </div>
      )}
      {candidate.whyItMatters && (
        <div>
          <div className="muted small">Why it matters</div>
          <div className="small">{candidate.whyItMatters}</div>
        </div>
      )}

      <div className="visual-ph" style={{ padding: imgUrl ? 0 : undefined, overflow: "hidden" }}>
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={candidate.visualPreview.title ?? "Generated visual"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              minHeight: 140,
            }}
          />
        ) : (
          <>
            {candidate.visualPreview.title ||
              candidate.visualPreview.metaphor ||
              "Visual preview placeholder"}
            {candidate.visualPreview.style
              ? ` · ${candidate.visualPreview.style}`
              : ""}
          </>
        )}
      </div>
      {(candidate.visualPreview.qcStatus || candidate.visualPreview.qcVerdict) && (
        <div className="small muted">
          Visual QC: {candidate.visualPreview.qcVerdict ?? candidate.visualPreview.qcStatus}
          {candidate.visualQcScore != null ? ` (${candidate.visualQcScore})` : ""}
        </div>
      )}

      {candidate.imageText && (
        <div>
          <div className="muted small">Image text</div>
          <div className="mono small">{candidate.imageText}</div>
        </div>
      )}
      {candidate.caption && (
        <div>
          <div className="muted small">Caption / final copy</div>
          <div className="small">{candidate.caption}</div>
        </div>
      )}

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {candidate.editorScore != null && (
          <span className="badge">Editor {candidate.editorScore.toFixed(0)}</span>
        )}
        {candidate.slopScore != null && (
          <span className="badge">Slop {candidate.slopScore.toFixed(0)}</span>
        )}
        {candidate.visualQcScore != null && (
          <span className="badge">VisualQC {candidate.visualQcScore.toFixed(0)}</span>
        )}
      </div>

      {candidate.whySelected && (
        <div>
          <div className="muted small">WHY SELECTED</div>
          <div className="small">{candidate.whySelected}</div>
        </div>
      )}

      {candidate.similarityWarning && (
        <div className="warn-text small">⚠ {candidate.similarityWarning}</div>
      )}

      {candidate.facebookReadiness && (
        <div className="small">
          <span className="muted">Facebook readiness: </span>
          {candidate.facebookReadiness.ready ? (
            <span className="badge ok">READY ({candidate.facebookReadiness.publishMode})</span>
          ) : (
            <span className="badge">
              BLOCKED — {candidate.facebookReadiness.reasons.join("; ") || "incomplete"}
            </span>
          )}
        </div>
      )}

      <div className="actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={a.className}
            disabled={busy !== null}
            onClick={() => runAction(a.id)}
          >
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
        <Link className="btn btn-ghost btn-sm" href={`/review/${candidate.id}`}>
          OPEN
        </Link>
      </div>
      {msg && <div className="small muted">{msg}</div>}
    </article>
  );
}
