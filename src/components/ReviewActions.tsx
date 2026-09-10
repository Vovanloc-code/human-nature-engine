"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS = [
  { id: "approve", label: "APPROVE", className: "btn btn-ok" },
  { id: "reject", label: "REJECT", className: "btn btn-danger" },
  { id: "favorite", label: "FAVORITE", className: "btn" },
  { id: "regenerate", label: "REGENERATE", className: "btn" },
  { id: "regenerate_visual", label: "REGENERATE VISUAL", className: "btn" },
  { id: "save_for_later", label: "SAVE FOR LATER", className: "btn" },
] as const;

export function ReviewActions({ contentAssetId }: { contentAssetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [imageText, setImageText] = useState("");
  const [body, setBody] = useState("");

  async function run(action: string, extras?: Record<string, unknown>) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/candidates/${contentAssetId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extras }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(`${action} ✓`);
      if (action === "approve") router.push("/queue");
      else router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel stack">
      <div className="actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={a.className}
            disabled={busy !== null}
            onClick={() => run(a.id)}
          >
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-2">
        <label className="field">
          <span>Edit title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title override"
          />
        </label>
        <label className="field">
          <span>Edit image text</span>
          <input
            type="text"
            value={imageText}
            onChange={(e) => setImageText(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Edit caption</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Edit body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy !== null}
        onClick={() =>
          run("edit", {
            edits: {
              ...(title ? { title } : {}),
              ...(caption ? { caption } : {}),
              ...(imageText ? { imageText } : {}),
              ...(body ? { body } : {}),
            },
          })
        }
      >
        {busy === "edit" ? "SAVING…" : "SAVE EDITS"}
      </button>
      {msg && <div className="small muted">{msg}</div>}
    </section>
  );
}
