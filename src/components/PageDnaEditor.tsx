"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PageDnaEditor({
  slug,
  initialJson,
}: {
  slug: string;
  initialJson: string;
}) {
  const router = useRouter();
  const [json, setJson] = useState(initialJson);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const res = await fetch(`/api/pages/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMsg("Saved");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>Page DNA (JSON)</h2>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        style={{ minHeight: 360 }}
      />
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save DNA"}
        </button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </section>
  );
}
