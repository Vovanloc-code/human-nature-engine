"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATFORMS = [
  { id: "fixture", label: "fixture" },
  { id: "facebook", label: "facebook" },
  { id: "instagram", label: "instagram" },
  { id: "wordpress", label: "wordpress" },
] as const;

export function QueuePublishControls({
  queueId,
  contentAssetId,
  disabled,
}: {
  queueId: string;
  contentAssetId: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>("fixture");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function publish() {
    if (!contentAssetId) {
      setMsg("No asset");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId,
          assetId: contentAssetId,
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setMsg(`${data.platform} ${data.mode} ✓`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
      <select
        className="mono small"
        value={platform}
        disabled={busy || disabled}
        onChange={(e) => setPlatform(e.target.value)}
        aria-label="Publish platform"
      >
        {PLATFORMS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={busy || disabled || !contentAssetId}
        onClick={publish}
      >
        {busy ? "…" : "Publish"}
      </button>
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}
