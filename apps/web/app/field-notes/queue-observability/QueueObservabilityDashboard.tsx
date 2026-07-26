"use client";

import { useEffect, useState } from "react";
import { getBrowserAuthClient } from "../../components/auth/authClient";

type QueueJob = {
  id: string;
  state: string;
  attemptsMade: number;
  maxAttempts: number;
  queuedAt: string;
  waitMs: number;
  durationMs: number | null;
  retrying: boolean;
};

type QueueOverview = {
  counts: { queued: number; running: number; failed: number; retrying: number };
  jobs: QueueJob[];
  generatedAt: string;
};

const formatDuration = (value: number | null) => {
  if (value === null) return "-";
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
};

export default function QueueObservabilityDashboard() {
  const [overview, setOverview] = useState<QueueOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const client = getBrowserAuthClient();
        const { data } = await client?.auth.getSession() ?? { data: { session: null } };
        const token = data.session?.access_token;
        if (!token) throw new Error("Sign in as an internal admin to view queue diagnostics.");
        const response = await fetch("/api/internal/queue", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to load queue diagnostics.");
        if (!cancelled) {
          setOverview(payload.data as QueueOverview);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load queue diagnostics.");
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 10_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  return <main className="min-h-screen bg-[#f5f1e8] px-6 py-10 text-[#173122]">
    <div className="mx-auto max-w-6xl space-y-6">
      <header><p className="text-xs uppercase tracking-[0.28em] text-[#6f7f71]">Internal Operations</p><h1 className="font-serif text-3xl">AI Queue Observability</h1><p className="mt-2 text-sm text-[#566758]">Refreshes every 10 seconds. Job prompts and payloads are intentionally excluded.</p></header>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(overview?.counts ?? {}).map(([label, value]) => <div key={label} className="rounded-2xl border border-[#d3d7cb] bg-white p-5"><p className="text-xs uppercase tracking-wide text-[#6f7f71]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
      </section>
      <section className="overflow-x-auto rounded-2xl border border-[#d3d7cb] bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#edf0e9] text-xs uppercase text-[#566758]"><tr><th className="p-3">Job</th><th className="p-3">State</th><th className="p-3">Attempts</th><th className="p-3">Wait</th><th className="p-3">Duration</th></tr></thead><tbody>{overview?.jobs.map((job) => <tr key={`${job.state}-${job.id}`} className="border-t border-[#edf0e9]"><td className="p-3 font-mono text-xs">{job.id}</td><td className="p-3">{job.retrying ? "retrying" : job.state}</td><td className="p-3">{job.attemptsMade}/{job.maxAttempts}</td><td className="p-3">{formatDuration(job.waitMs)}</td><td className="p-3">{formatDuration(job.durationMs)}</td></tr>)}</tbody></table>{overview?.jobs.length === 0 ? <p className="p-5 text-sm text-[#566758]">No queued or recent failed jobs.</p> : null}</section>
    </div>
  </main>;
}
