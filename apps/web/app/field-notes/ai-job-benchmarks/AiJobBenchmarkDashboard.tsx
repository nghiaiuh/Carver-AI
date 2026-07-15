"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getBrowserAuthClient } from "../../components/auth/authClient";
import {
  buildAiJobBenchmarkSummary,
  clearAiJobBenchmarkStore,
  finishAiJobBenchmarkRun,
  getAiJobBenchmarkStore,
  recordAiJobPollRequest,
  recordAiJobPollTransportFailure,
  startAiJobBenchmarkRun,
  type AiJobBenchmarkEvent,
} from "../../canvas/utils/aiJobBenchmark";

type SnapshotRouteResponse = {
  success?: boolean;
  code?: string;
  requestId?: string;
  data?: {
    document?: unknown;
    snapshot?: {
      snapshotId?: string | null;
    } | null;
  };
  error?: string;
};

type CreateAiJobResponse = {
  success?: boolean;
  code?: string;
  requestId?: string;
  data?: {
    job?: {
      id: string;
      status: string;
      projectId: string;
      jobResult?: {
        generatedImages?: Array<unknown>;
      } | null;
      errorMessage?: string | null;
    };
  };
  error?: string;
};

type GetAiJobResponse = {
  success?: boolean;
  code?: string;
  requestId?: string;
  data?: {
    job?: {
      id: string;
      status: string;
      projectId: string;
      updatedAt: string;
      errorMessage?: string | null;
      jobResult?: {
        generatedImages?: Array<unknown>;
      } | null;
    };
  };
  error?: string;
};

const SIMULATION_SCENARIOS = [
  "success",
  "slow_success",
  "transient_provider_fail_then_success",
  "permanent_fail",
] as const;

async function getAuthorizedHeaders(init?: HeadersInit) {
  const client = getBrowserAuthClient();
  if (!client) {
    throw new Error("Please sign in to run AI job benchmarks.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in to run AI job benchmarks.");
  }

  const headers = new Headers(init);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(durationMs: number) {
  if (durationMs >= 1000) {
    return `${formatNumber(durationMs / 1000)} s`;
  }

  return `${formatNumber(durationMs)} ms`;
}

function summarizeByProject(events: AiJobBenchmarkEvent[]) {
  const store = getAiJobBenchmarkStore();
  const runMap = new Map<string, ReturnType<typeof buildAiJobBenchmarkSummary>>();
  const runsByProject = new Map<string, typeof store.runs[string][]>();

  Object.values(store.runs).forEach((run) => {
    const key = run.projectId ?? "unknown";
    runsByProject.set(key, [...(runsByProject.get(key) ?? []), run]);
  });

  for (const [projectId, runs] of runsByProject.entries()) {
    runMap.set(projectId, buildAiJobBenchmarkSummary(runs));
  }

  return [...runMap.entries()].map(([projectId, summary]) => ({
    projectId,
    summary,
  }));
}

function summarizeBySource() {
  const store = getAiJobBenchmarkStore();
  const runsBySource = new Map<string, typeof store.runs[string][]>();

  Object.values(store.runs).forEach((run) => {
    runsBySource.set(run.source, [...(runsBySource.get(run.source) ?? []), run]);
  });

  return [...runsBySource.entries()].map(([source, runs]) => ({
    source,
    summary: buildAiJobBenchmarkSummary(runs),
  }));
}

export default function AiJobBenchmarkDashboard() {
  const [version, setVersion] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [runnerMessage, setRunnerMessage] = useState<string | null>(null);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener("carver:ai-job-benchmark-updated", refresh as EventListener);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("carver:ai-job-benchmark-updated", refresh as EventListener);
    };
  }, []);

  const store = useMemo(() => getAiJobBenchmarkStore(), [version]);
  const runs = useMemo(() => Object.values(store.runs), [store.runs]);
  const summary = useMemo(() => buildAiJobBenchmarkSummary(runs), [runs]);
  const byProject = useMemo(() => summarizeByProject(store.events), [version, store.events]);
  const bySource = useMemo(() => summarizeBySource(), [version]);

  const formatApiError = (params: {
    status: number;
    error?: string;
    code?: string;
    requestId?: string;
    fallback: string;
  }) => {
    const parts = [params.error || params.fallback, `(HTTP ${params.status})`];
    if (params.code) {
      parts.push(`[${params.code}]`);
    }
    if (params.requestId) {
      parts.push(`requestId=${params.requestId}`);
    }
    return parts.join(" ");
  };

  const runSimulationScenario = async (
    scenario: (typeof SIMULATION_SCENARIOS)[number],
  ) => {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      setRunnerMessage("Enter a projectId before running a simulation.");
      return;
    }

    setRunningScenario(scenario);
    setRunnerMessage(null);
    let activeJobId: string | null = null;

    try {
      const snapshotResponse = await fetch(`/api/projects/${normalizedProjectId}/snapshot`, {
        cache: "no-store",
        headers: await getAuthorizedHeaders(),
      });
      const snapshotPayload = (await snapshotResponse.json().catch(() => ({}))) as SnapshotRouteResponse;
      if (!snapshotResponse.ok || !snapshotPayload.data?.document) {
        throw new Error(
          formatApiError({
            status: snapshotResponse.status,
            error: snapshotPayload.error,
            code: snapshotPayload.code,
            requestId: snapshotPayload.requestId,
            fallback: "Unable to load the current project snapshot.",
          }),
        );
      }

      const requestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `benchmark-${Date.now()}`;
      const snapshotId = snapshotPayload.data.snapshot?.snapshotId ?? null;
      const createResponse = await fetch(`/api/projects/${normalizedProjectId}/ai-jobs`, {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          projectId: normalizedProjectId,
          prompt: `Benchmark scenario: ${scenario}`,
          jobType: "generate_concept",
          executionMode: "text_to_image",
          promptMode: "auto",
          inputSnapshotId: snapshotId ?? undefined,
          snapshot: snapshotId ? undefined : snapshotPayload.data.document,
          idempotencyKey: requestId,
          simulation: {
            scenario,
            delayMs: scenario === "slow_success" ? 3500 : 400,
            failUntilAttempt: scenario === "transient_provider_fail_then_success" ? 1 : undefined,
          },
        }),
      });
      const createPayload = (await createResponse.json().catch(() => ({}))) as CreateAiJobResponse;
      const job = createPayload.data?.job;

      if (!createResponse.ok || !job?.id) {
        throw new Error(
          formatApiError({
            status: createResponse.status,
            error: createPayload.error,
            code: createPayload.code,
            requestId: createPayload.requestId,
            fallback: "Unable to create the benchmark AI job.",
          }),
        );
      }
      activeJobId = job.id;

      startAiJobBenchmarkRun({
        jobId: job.id,
        projectId: normalizedProjectId,
        source: "benchmark",
        requestId,
      });

      let finished = false;
      const startedAt = Date.now();
      while (!finished) {
        const pollResponse = await fetch(`/api/projects/${normalizedProjectId}/ai-jobs/${job.id}`, {
          cache: "no-store",
          headers: await getAuthorizedHeaders(),
        });
        const pollPayload = (await pollResponse.json().catch(() => ({}))) as GetAiJobResponse;
        recordAiJobPollRequest({
          jobId: job.id,
          projectId: normalizedProjectId,
          status: pollPayload.data?.job?.status ?? null,
        });

        if (!pollResponse.ok || !pollPayload.data?.job) {
          throw new Error(
            formatApiError({
              status: pollResponse.status,
              error: pollPayload.error,
              code: pollPayload.code,
              requestId: pollPayload.requestId,
              fallback: "Unable to load benchmark AI job status.",
            }),
          );
        }

        const polledJob = pollPayload.data.job;
        if (polledJob.status === "queued" || polledJob.status === "running") {
          if (Date.now() - startedAt > 120_000) {
            throw new Error("Benchmark AI job timed out while waiting for a terminal state.");
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        finished = true;
        finishAiJobBenchmarkRun({
          jobId: polledJob.id,
          projectId: normalizedProjectId,
          terminalStatus:
            polledJob.status === "succeeded"
              ? "succeeded"
              : polledJob.status === "cancelled"
                ? "cancelled"
                : polledJob.status === "enqueue_failed"
                  ? "enqueue_failed"
                  : "failed",
          generatedImageCount: polledJob.jobResult?.generatedImages?.length ?? 0,
          errorMessage: polledJob.errorMessage ?? null,
        });
        setRunnerMessage(`Scenario "${scenario}" finished with status ${polledJob.status}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Benchmark run failed.";
      if (activeJobId) {
        recordAiJobPollTransportFailure({
          jobId: activeJobId,
          projectId: projectId.trim() || null,
          message,
        });
        finishAiJobBenchmarkRun({
          jobId: activeJobId,
          projectId: projectId.trim() || null,
          terminalStatus: "poll_abandoned",
          generatedImageCount: 0,
          errorMessage: message,
        });
      }
      setRunnerMessage(message);
    } finally {
      setRunningScenario(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4efe6] px-6 py-10 text-[#1f3528]">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-[28px] border border-[#d3d7cb] bg-white/85 p-6 shadow-[0_18px_50px_rgba(46,74,58,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#6f7f71]">
                Internal Benchmark
              </p>
              <h1 className="font-serif text-3xl text-[#173122]">AI Job Reliability Metrics</h1>
              <p className="mt-2 max-w-3xl text-sm text-[#566758]">
                Hidden benchmark dashboard for queue-backed generation runs. It tracks end-to-end job
                outcomes from enqueue to terminal UI status, including poll retries and recovered
                transport failures in this browser session history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => clearAiJobBenchmarkStore()}
              className="rounded-full border border-[#b8c4b2] bg-[#214730] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#173122]"
            >
              Clear local metrics
            </button>
          </div>
          <p className="mt-3 text-xs text-[#6f7f71]">
            Last updated: {store.updatedAt === new Date(0).toISOString() ? "No data yet" : store.updatedAt}
          </p>
        </header>

        <Panel title="Simulation Runner">
          <div className="space-y-4">
            <label className="block space-y-2 text-sm text-[#415444]">
              <span className="font-medium text-[#173122]">Project ID</span>
              <input
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="Paste a projectId to run benchmark jobs"
                className="w-full rounded-2xl border border-[#cfd8cb] bg-[#fbfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#214730]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              {SIMULATION_SCENARIOS.map((scenario) => (
                <button
                  key={scenario}
                  type="button"
                  disabled={Boolean(runningScenario)}
                  onClick={() => void runSimulationScenario(scenario)}
                  className="rounded-full border border-[#b8c4b2] bg-[#eef2ea] px-4 py-2 text-sm font-medium text-[#173122] transition hover:bg-[#dfe8d9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningScenario === scenario ? `Running ${scenario}...` : scenario}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#6f7f71]">
              These scenarios enqueue real BullMQ jobs but use worker-side simulation instead of calling OpenAI.
              They still exercise job creation, queueing, retry, polling, terminal state handling, asset persistence,
              and benchmark capture.
            </p>
            {runnerMessage ? <p className="text-sm text-[#214730]">{runnerMessage}</p> : null}
          </div>
        </Panel>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Runs" value={formatNumber(summary.totalRuns)} />
          <MetricCard label="Finished" value={formatNumber(summary.finishedRuns)} />
          <MetricCard label="Success Rate" value={`${formatNumber(summary.successRate)}%`} />
          <MetricCard label="Avg Duration" value={formatDuration(summary.averageDurationMs)} />
          <MetricCard label="P95 Duration" value={formatDuration(summary.p95DurationMs)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Health">
            <div className="space-y-3 text-sm text-[#415444]">
              <p>Succeeded: {formatNumber(summary.succeededRuns)}</p>
              <p>Failed or abandoned: {formatNumber(summary.failedRuns)}</p>
              <p>Recovered after poll transport failure: {formatNumber(summary.recoveredAfterTransportFailureCount)}</p>
              <p>Avg poll requests per run: {formatNumber(summary.averagePollRequests)}</p>
            </div>
          </Panel>
          <Panel title="By Source">
            <div className="space-y-3">
              {bySource.length === 0 ? (
                <EmptyState />
              ) : (
                bySource.map((item) => (
                  <RowSummary
                    key={item.source}
                    label={item.source}
                    metrics={[
                      `${formatNumber(item.summary.totalRuns)} runs`,
                      `${formatNumber(item.summary.successRate)}% success`,
                      `${formatDuration(item.summary.averageDurationMs)} avg`,
                      `${formatNumber(item.summary.averagePollRequests)} polls/run`,
                    ]}
                  />
                ))
              )}
            </div>
          </Panel>
        </section>

        <Panel title="By Project">
          <div className="space-y-3">
            {byProject.length === 0 ? (
              <EmptyState />
            ) : (
              byProject.map((item) => (
                <RowSummary
                  key={item.projectId}
                  label={item.projectId}
                  metrics={[
                    `${formatNumber(item.summary.totalRuns)} runs`,
                    `${formatNumber(item.summary.successRate)}% success`,
                    `${formatDuration(item.summary.averageDurationMs)} avg`,
                    `${formatNumber(item.summary.averagePollRequests)} polls/run`,
                  ]}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel title="Recent Events">
          {store.events.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-[#6f7f71]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {[...store.events].reverse().map((event) => (
                    <tr key={event.id} className="bg-white/85 text-[#203526] shadow-[0_8px_24px_rgba(46,74,58,0.06)]">
                      <td className="rounded-l-2xl px-3 py-3">{event.createdAt}</td>
                      <td className="px-3 py-3">{event.type}</td>
                      <td className="px-3 py-3">{event.jobId}</td>
                      <td className="px-3 py-3">{event.projectId ?? "unknown"}</td>
                      <td className="rounded-r-2xl px-3 py-3">
                        {renderEventDetail(event)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

function renderEventDetail(event: AiJobBenchmarkEvent) {
  switch (event.type) {
    case "job-started":
      return `${event.source}${event.requestId ? ` • request ${event.requestId}` : ""}`;
    case "poll-request":
      return event.status ?? "status unknown";
    case "poll-transport-failure":
      return event.message;
    case "job-finished":
      return `${event.terminalStatus} • ${formatDuration(event.durationMs)} • ${event.pollRequestCount} polls • ${event.transportFailureCount} transport failures${event.errorMessage ? ` • ${event.errorMessage}` : ""}`;
    default:
      return "—";
  }
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[#d3d7cb] bg-white/85 p-5 shadow-[0_14px_40px_rgba(46,74,58,0.05)]">
      <p className="text-xs uppercase tracking-[0.2em] text-[#718172]">{props.label}</p>
      <p className="mt-3 font-serif text-3xl text-[#173122]">{props.value}</p>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-[#d3d7cb] bg-white/85 p-6 shadow-[0_16px_40px_rgba(46,74,58,0.05)]">
      <h2 className="font-serif text-2xl text-[#173122]">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function RowSummary(props: { label: string; metrics: string[] }) {
  return (
    <div className="rounded-[20px] border border-[#d7ddd2] bg-[#fbfaf7] px-4 py-3">
      <p className="font-medium text-[#173122]">{props.label}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#5d6f5f]">
        {props.metrics.map((metric) => (
          <span key={metric} className="rounded-full bg-[#eef2ea] px-3 py-1">
            {metric}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[20px] border border-dashed border-[#c7d0c2] bg-[#faf8f2] px-4 py-8 text-sm text-[#5d6f5f]">
      No benchmark runs collected yet. Start an AI generation from chat or canvas, let the job poll to a
      terminal state, then return here.
    </div>
  );
}
