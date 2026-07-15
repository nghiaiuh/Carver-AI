"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  buildCanvasPersistenceBenchmarkSummary,
  clearCanvasPersistenceBenchmarkEvents,
  getCanvasPersistenceBenchmarkStore,
  type CanvasPersistenceBenchmarkEvent,
} from "../../canvas/utils/persistenceBenchmark";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${formatNumber(value)} ${units[unitIndex]}`;
}

function summarizeByProject(events: CanvasPersistenceBenchmarkEvent[]) {
  const map = new Map<string, CanvasPersistenceBenchmarkEvent[]>();
  for (const event of events) {
    const key = event.projectId ?? "unknown";
    map.set(key, [...(map.get(key) ?? []), event]);
  }

  return [...map.entries()].map(([projectId, projectEvents]) => ({
    projectId,
    summary: buildCanvasPersistenceBenchmarkSummary(projectEvents),
  }));
}

function summarizeByOperation(events: CanvasPersistenceBenchmarkEvent[]) {
  const map = new Map<string, CanvasPersistenceBenchmarkEvent[]>();
  for (const event of events) {
    map.set(event.operation, [...(map.get(event.operation) ?? []), event]);
  }

  return [...map.entries()].map(([operation, operationEvents]) => ({
    operation,
    summary: buildCanvasPersistenceBenchmarkSummary(operationEvents),
  }));
}

export default function CanvasBenchmarkDashboard() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener("carver:persistence-benchmark-updated", refresh as EventListener);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("carver:persistence-benchmark-updated", refresh as EventListener);
    };
  }, []);

  const store = useMemo(() => getCanvasPersistenceBenchmarkStore(), [version]);
  const overallSummary = useMemo(
    () => buildCanvasPersistenceBenchmarkSummary(store.events),
    [store.events],
  );
  const byProject = useMemo(() => summarizeByProject(store.events), [store.events]);
  const byOperation = useMemo(() => summarizeByOperation(store.events), [store.events]);

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-6 py-10 text-[#1f3528]">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[28px] border border-[#d3d7cb] bg-white/80 p-6 shadow-[0_18px_50px_rgba(46,74,58,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#6f7f71]">
                Internal Benchmark
              </p>
              <h1 className="font-serif text-3xl text-[#173122]">
                Canvas Autosave Metrics
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[#566758]">
                Hidden local benchmark dashboard for autosave, cloud draft sync, and snapshot finalize
                behavior. Data is collected from this browser only and stored in local storage so we can
                measure request suppression and payload size before wiring permanent telemetry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => clearCanvasPersistenceBenchmarkEvents()}
              className="rounded-full border border-[#b8c4b2] bg-[#214730] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#173122]"
            >
              Clear local metrics
            </button>
          </div>
          <p className="text-xs text-[#6f7f71]">
            Last updated: {store.updatedAt === new Date(0).toISOString() ? "No data yet" : store.updatedAt}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Attempts" value={formatNumber(overallSummary.totalAttempts)} />
          <MetricCard label="Requests Sent" value={formatNumber(overallSummary.totalRequestsSent)} />
          <MetricCard
            label="Request Reduction"
            value={`${formatNumber(overallSummary.redundantSaveRequestReduction)}%`}
          />
          <MetricCard label="Avg Payload" value={formatBytes(overallSummary.averagePayloadBytes)} />
          <MetricCard label="P95 Payload" value={formatBytes(overallSummary.p95PayloadBytes)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="By Operation">
            <div className="space-y-3">
              {byOperation.length === 0 ? (
                <EmptyState />
              ) : (
                byOperation.map((item) => (
                  <RowSummary
                    key={item.operation}
                    label={item.operation}
                    metrics={[
                      `${formatNumber(item.summary.totalAttempts)} attempts`,
                      `${formatNumber(item.summary.totalRequestsSent)} sent`,
                      `${formatNumber(item.summary.redundantSaveRequestReduction)}% reduced`,
                      `${formatBytes(item.summary.averagePayloadBytes)} avg payload`,
                    ]}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="Health">
            <div className="space-y-3 text-sm text-[#415444]">
              <p>Succeeded: {formatNumber(overallSummary.totalSucceeded)}</p>
              <p>Failed: {formatNumber(overallSummary.totalFailed)}</p>
              <p>Skipped: {formatNumber(overallSummary.totalSkipped)}</p>
              <p>Avg duration: {formatNumber(overallSummary.averageDurationMs)} ms</p>
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
                    `${formatNumber(item.summary.totalAttempts)} attempts`,
                    `${formatNumber(item.summary.totalRequestsSent)} sent`,
                    `${formatNumber(item.summary.redundantSaveRequestReduction)}% reduced`,
                    `${formatBytes(item.summary.averagePayloadBytes)} avg payload`,
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
                    <th className="px-3 py-2 font-medium">Operation</th>
                    <th className="px-3 py-2 font-medium">Intent</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2 font-medium">Request</th>
                    <th className="px-3 py-2 font-medium">Payload</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Skip/Error</th>
                  </tr>
                </thead>
                <tbody>
                  {[...store.events].reverse().map((event) => (
                    <tr key={event.id} className="rounded-2xl bg-white/85 text-[#203526] shadow-[0_8px_24px_rgba(46,74,58,0.06)]">
                      <td className="rounded-l-2xl px-3 py-3">{event.attemptedAt}</td>
                      <td className="px-3 py-3">{event.operation}</td>
                      <td className="px-3 py-3">{event.intent}</td>
                      <td className="px-3 py-3">{event.result}</td>
                      <td className="px-3 py-3">{event.requestSent ? "sent" : "local-only"}</td>
                      <td className="px-3 py-3">{formatBytes(event.payloadBytes)}</td>
                      <td className="px-3 py-3">{formatNumber(event.durationMs)} ms</td>
                      <td className="rounded-r-2xl px-3 py-3">
                        {event.skipReason ?? event.errorMessage ?? "—"}
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
      No benchmark events collected yet. Open a canvas project, make edits, let autosave run, then come back here.
    </div>
  );
}
