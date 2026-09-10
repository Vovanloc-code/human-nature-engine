"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IdeaVaultSearch({
  initialQ,
  initialStatus,
}: {
  initialQ: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const qs = params.toString();
    router.push(qs ? `/idea-vault?${qs}` : "/idea-vault");
  }

  return (
    <form className="panel row" onSubmit={submit}>
      <label className="field" style={{ flex: 1, minWidth: 200 }}>
        <span>Search</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Statement, observation…"
        />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any</option>
          <option value="candidate">candidate</option>
          <option value="approved">approved</option>
          <option value="used">used</option>
          <option value="needs_research">needs_research</option>
          <option value="rejected">rejected</option>
          <option value="retired">retired</option>
        </select>
      </label>
      <div style={{ alignSelf: "flex-end" }}>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </div>
    </form>
  );
}
