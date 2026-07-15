import type { PromptWarning } from "@carver/shared";

export type PromptEngineTelemetryEvent = {
  scope: "enhance" | "generation";
  engineRunId: string;
  planHash?: string;
  contextRevision: number;
  degraded: boolean;
  warningCodes: PromptWarning["code"][];
  latencyMs?: number | null;
  retryCount?: number;
  fallbackReason?: string | null;
};

export const recordPromptEngineTelemetry = (event: PromptEngineTelemetryEvent) => {
  return {
    ...event,
    recordedAt: new Date().toISOString(),
  };
};
