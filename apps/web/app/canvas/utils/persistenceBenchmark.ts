"use client";

export type CanvasPersistenceBenchmarkOperation =
  | "local-draft-save"
  | "cloud-draft-sync"
  | "snapshot-finalize"
  | "snapshot-load";

export type CanvasPersistenceBenchmarkResult =
  | "succeeded"
  | "failed"
  | "skipped";

export type CanvasPersistenceBenchmarkSkipReason =
  | "not-ready"
  | "dedupe"
  | "inflight"
  | "not-leader"
  | "transient-content"
  | "not-dirty"
  | "missing-project"
  | "missing-revision"
  | "conflict";

export type CanvasPersistenceBenchmarkEvent = {
  id: string;
  operation: CanvasPersistenceBenchmarkOperation;
  projectId: string | null;
  intent: "autosave" | "manual" | "close" | "load";
  attemptedAt: string;
  durationMs: number;
  payloadBytes: number;
  requestSent: boolean;
  result: CanvasPersistenceBenchmarkResult;
  skipReason?: CanvasPersistenceBenchmarkSkipReason;
  errorMessage?: string;
};

type CanvasPersistenceBenchmarkSummary = {
  totalAttempts: number;
  totalRequestsSent: number;
  totalSucceeded: number;
  totalFailed: number;
  totalSkipped: number;
  redundantSaveRequestReduction: number;
  averagePayloadBytes: number;
  p95PayloadBytes: number;
  averageDurationMs: number;
};

type CanvasPersistenceBenchmarkStore = {
  events: CanvasPersistenceBenchmarkEvent[];
  updatedAt: string;
};

const BENCHMARK_STORAGE_KEY = "carver:canvasPersistenceBenchmark:v1";
const MAX_BENCHMARK_EVENTS = 400;

function isBrowser() {
  return typeof window !== "undefined";
}

function readStore(): CanvasPersistenceBenchmarkStore {
  if (!isBrowser()) {
    return { events: [], updatedAt: new Date(0).toISOString() };
  }

  try {
    const raw = window.localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) {
      return { events: [], updatedAt: new Date(0).toISOString() };
    }

    const parsed = JSON.parse(raw) as CanvasPersistenceBenchmarkStore;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return { events: [], updatedAt: new Date(0).toISOString() };
  }
}

function writeStore(store: CanvasPersistenceBenchmarkStore) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("carver:persistence-benchmark-updated"));
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

function roundMetric(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function estimateCanvasPayloadBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

export function recordCanvasPersistenceBenchmarkEvent(
  event: Omit<CanvasPersistenceBenchmarkEvent, "id">,
) {
  const store = readStore();
  const nextEvent: CanvasPersistenceBenchmarkEvent = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...event,
  };

  store.events = [...store.events, nextEvent].slice(-MAX_BENCHMARK_EVENTS);
  store.updatedAt = new Date().toISOString();
  writeStore(store);
}

export function clearCanvasPersistenceBenchmarkEvents() {
  writeStore({
    events: [],
    updatedAt: new Date().toISOString(),
  });
}

export function getCanvasPersistenceBenchmarkStore() {
  return readStore();
}

export function buildCanvasPersistenceBenchmarkSummary(
  events: CanvasPersistenceBenchmarkEvent[],
): CanvasPersistenceBenchmarkSummary {
  const requestEvents = events.filter((event) => event.operation !== "snapshot-load");
  const payloadEvents = requestEvents.filter((event) => event.requestSent && event.payloadBytes > 0);
  const totalAttempts = requestEvents.length;
  const totalRequestsSent = requestEvents.filter((event) => event.requestSent).length;
  const totalSucceeded = requestEvents.filter((event) => event.result === "succeeded").length;
  const totalFailed = requestEvents.filter((event) => event.result === "failed").length;
  const totalSkipped = requestEvents.filter((event) => event.result === "skipped").length;

  const redundantSaveRequestReduction =
    totalAttempts > 0 ? ((totalAttempts - totalRequestsSent) / totalAttempts) * 100 : 0;

  return {
    totalAttempts,
    totalRequestsSent,
    totalSucceeded,
    totalFailed,
    totalSkipped,
    redundantSaveRequestReduction: roundMetric(redundantSaveRequestReduction),
    averagePayloadBytes: roundMetric(computeAverage(payloadEvents.map((event) => event.payloadBytes))),
    p95PayloadBytes: roundMetric(computePercentile(payloadEvents.map((event) => event.payloadBytes), 95)),
    averageDurationMs: roundMetric(computeAverage(requestEvents.map((event) => event.durationMs))),
  };
}
