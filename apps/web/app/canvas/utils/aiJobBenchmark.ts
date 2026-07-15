"use client";

export type AiJobBenchmarkSource = "chat" | "canvas" | "benchmark";
export type AiJobBenchmarkTerminalStatus =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "enqueue_failed"
  | "poll_abandoned";

export type AiJobBenchmarkEvent =
  | {
      id: string;
      type: "job-started";
      jobId: string;
      projectId: string | null;
      source: AiJobBenchmarkSource;
      createdAt: string;
      requestId?: string | null;
    }
  | {
      id: string;
      type: "poll-request";
      jobId: string;
      projectId: string | null;
      createdAt: string;
      status?: string | null;
    }
  | {
      id: string;
      type: "poll-transport-failure";
      jobId: string;
      projectId: string | null;
      createdAt: string;
      message: string;
    }
  | {
      id: string;
      type: "job-finished";
      jobId: string;
      projectId: string | null;
      createdAt: string;
      terminalStatus: AiJobBenchmarkTerminalStatus;
      durationMs: number;
      pollRequestCount: number;
      transportFailureCount: number;
      recoveredAfterTransportFailure: boolean;
      generatedImageCount: number;
      errorMessage?: string | null;
    };

type AiJobBenchmarkRun = {
  jobId: string;
  projectId: string | null;
  source: AiJobBenchmarkSource;
  requestId: string | null;
  startedAt: string;
  finishedAt: string | null;
  terminalStatus: AiJobBenchmarkTerminalStatus | null;
  durationMs: number | null;
  pollRequestCount: number;
  transportFailureCount: number;
  recoveredAfterTransportFailure: boolean;
  generatedImageCount: number;
  errorMessage: string | null;
};

type AiJobBenchmarkStore = {
  runs: Record<string, AiJobBenchmarkRun>;
  events: AiJobBenchmarkEvent[];
  updatedAt: string;
};

type AiJobBenchmarkSummary = {
  totalRuns: number;
  finishedRuns: number;
  succeededRuns: number;
  failedRuns: number;
  successRate: number;
  recoveredAfterTransportFailureCount: number;
  averageDurationMs: number;
  p95DurationMs: number;
  averagePollRequests: number;
};

const AI_JOB_BENCHMARK_STORAGE_KEY = "carver:aiJobBenchmark:v1";
const MAX_AI_JOB_BENCHMARK_EVENTS = 500;

function isBrowser() {
  return typeof window !== "undefined";
}

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyStore(): AiJobBenchmarkStore {
  return {
    runs: {},
    events: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function readStore(): AiJobBenchmarkStore {
  if (!isBrowser()) {
    return emptyStore();
  }

  try {
    const raw = window.localStorage.getItem(AI_JOB_BENCHMARK_STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw) as Partial<AiJobBenchmarkStore>;
    return {
      runs: parsed.runs && typeof parsed.runs === "object" ? parsed.runs as Record<string, AiJobBenchmarkRun> : {},
      events: Array.isArray(parsed.events) ? parsed.events as AiJobBenchmarkEvent[] : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: AiJobBenchmarkStore) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AI_JOB_BENCHMARK_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("carver:ai-job-benchmark-updated"));
}

function updateStore(
  updater: (store: AiJobBenchmarkStore) => AiJobBenchmarkStore,
) {
  const updated = updater(readStore());
  updated.updatedAt = new Date().toISOString();
  writeStore(updated);
}

function appendEvent(store: AiJobBenchmarkStore, event: AiJobBenchmarkEvent) {
  store.events = [...store.events, event].slice(-MAX_AI_JOB_BENCHMARK_EVENTS);
}

function roundMetric(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function computeAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computePercentile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

export function startAiJobBenchmarkRun(params: {
  jobId: string;
  projectId: string | null;
  source: AiJobBenchmarkSource;
  requestId?: string | null;
}) {
  updateStore((store) => {
    store.runs[params.jobId] = {
      jobId: params.jobId,
      projectId: params.projectId,
      source: params.source,
      requestId: params.requestId ?? null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      terminalStatus: null,
      durationMs: null,
      pollRequestCount: 0,
      transportFailureCount: 0,
      recoveredAfterTransportFailure: false,
      generatedImageCount: 0,
      errorMessage: null,
    };

    appendEvent(store, {
      id: createId(),
      type: "job-started",
      jobId: params.jobId,
      projectId: params.projectId,
      source: params.source,
      createdAt: new Date().toISOString(),
      requestId: params.requestId ?? null,
    });

    return store;
  });
}

export function recordAiJobPollRequest(params: {
  jobId: string;
  projectId: string | null;
  status?: string | null;
}) {
  updateStore((store) => {
    const run = store.runs[params.jobId];
    if (run) {
      run.pollRequestCount += 1;
    }

    appendEvent(store, {
      id: createId(),
      type: "poll-request",
      jobId: params.jobId,
      projectId: params.projectId,
      createdAt: new Date().toISOString(),
      status: params.status ?? null,
    });

    return store;
  });
}

export function recordAiJobPollTransportFailure(params: {
  jobId: string;
  projectId: string | null;
  message: string;
}) {
  updateStore((store) => {
    const run = store.runs[params.jobId];
    if (run) {
      run.transportFailureCount += 1;
    }

    appendEvent(store, {
      id: createId(),
      type: "poll-transport-failure",
      jobId: params.jobId,
      projectId: params.projectId,
      createdAt: new Date().toISOString(),
      message: params.message,
    });

    return store;
  });
}

export function finishAiJobBenchmarkRun(params: {
  jobId: string;
  projectId: string | null;
  terminalStatus: AiJobBenchmarkTerminalStatus;
  generatedImageCount: number;
  errorMessage?: string | null;
}) {
  updateStore((store) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const run = store.runs[params.jobId] ?? {
      jobId: params.jobId,
      projectId: params.projectId,
      source: "chat" as const,
      requestId: null,
      startedAt: nowIso,
      finishedAt: null,
      terminalStatus: null,
      durationMs: null,
      pollRequestCount: 0,
      transportFailureCount: 0,
      recoveredAfterTransportFailure: false,
      generatedImageCount: 0,
      errorMessage: null,
    };

    const durationMs = Math.max(0, now.getTime() - Date.parse(run.startedAt || nowIso));
    run.finishedAt = nowIso;
    run.terminalStatus = params.terminalStatus;
    run.durationMs = durationMs;
    run.generatedImageCount = params.generatedImageCount;
    run.errorMessage = params.errorMessage ?? null;
    run.recoveredAfterTransportFailure =
      params.terminalStatus === "succeeded" && run.transportFailureCount > 0;
    store.runs[params.jobId] = run;

    appendEvent(store, {
      id: createId(),
      type: "job-finished",
      jobId: params.jobId,
      projectId: params.projectId,
      createdAt: nowIso,
      terminalStatus: params.terminalStatus,
      durationMs,
      pollRequestCount: run.pollRequestCount,
      transportFailureCount: run.transportFailureCount,
      recoveredAfterTransportFailure: run.recoveredAfterTransportFailure,
      generatedImageCount: params.generatedImageCount,
      errorMessage: params.errorMessage ?? null,
    });

    return store;
  });
}

export function getAiJobBenchmarkStore() {
  return readStore();
}

export function clearAiJobBenchmarkStore() {
  writeStore({
    runs: {},
    events: [],
    updatedAt: new Date().toISOString(),
  });
}

export function buildAiJobBenchmarkSummary(
  runs: AiJobBenchmarkRun[],
): AiJobBenchmarkSummary {
  const finishedRuns = runs.filter((run) => run.terminalStatus);
  const succeededRuns = finishedRuns.filter((run) => run.terminalStatus === "succeeded");
  const failedRuns = finishedRuns.filter((run) => run.terminalStatus !== "succeeded");
  const durations = finishedRuns
    .map((run) => run.durationMs ?? 0)
    .filter((duration) => duration > 0);
  const pollCounts = finishedRuns.map((run) => run.pollRequestCount);

  return {
    totalRuns: runs.length,
    finishedRuns: finishedRuns.length,
    succeededRuns: succeededRuns.length,
    failedRuns: failedRuns.length,
    successRate: finishedRuns.length > 0 ? roundMetric((succeededRuns.length / finishedRuns.length) * 100) : 0,
    recoveredAfterTransportFailureCount: succeededRuns.filter((run) => run.recoveredAfterTransportFailure).length,
    averageDurationMs: roundMetric(computeAverage(durations)),
    p95DurationMs: roundMetric(computePercentile(durations, 95)),
    averagePollRequests: roundMetric(computeAverage(pollCounts)),
  };
}
