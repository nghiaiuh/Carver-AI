/*
 * Flow: Emits low-volume, redacted operational alerts from server runtimes.
 * 1. Keep alert delivery optional so outages in the alert vendor never fail work.
 * 2. Reuse safe-log redaction before data leaves the process.
 * 3. Apply a local cooldown to avoid alert storms for the same failure class.
 */

import { redactLogValue } from "./safe-logger";

export type OperationalAlertSeverity = "warning" | "error" | "critical";

export type OperationalAlert = {
  event: string;
  severity: OperationalAlertSeverity;
  metadata?: Record<string, unknown>;
  cooldownKey?: string;
};

export type OperationalAlertResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "cooldown" | "delivery_failed" };

type AlertEnvironment = {
  OPS_ALERT_WEBHOOK_URL?: string;
  OPS_ALERT_COOLDOWN_MS?: string;
  NODE_ENV?: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const lastSentAtByKey = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function readCooldownMs(env: AlertEnvironment) {
  const value = Number(env.OPS_ALERT_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_COOLDOWN_MS;
}

function canUseWebhook(url: string, env: AlertEnvironment) {
  try {
    const parsed = new URL(url);
    return env.NODE_ENV !== "production" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The webhook receives generic JSON and can point to a provider bridge such as
 * Sentry, Better Stack, PagerDuty, Slack, or an internal alert relay.
 */
export async function notifyOperationalAlert(
  alert: OperationalAlert,
  options?: {
    env?: AlertEnvironment;
    now?: number;
    fetcher?: FetchLike;
  },
): Promise<OperationalAlertResult> {
  const env = options?.env ?? process.env;
  const webhookUrl = env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl || !canUseWebhook(webhookUrl, env)) {
    return { delivered: false, reason: "not_configured" };
  }

  const now = options?.now ?? Date.now();
  const cooldownKey = alert.cooldownKey ?? `${alert.severity}:${alert.event}`;
  const previousSentAt = lastSentAtByKey.get(cooldownKey);
  if (previousSentAt !== undefined && now - previousSentAt < readCooldownMs(env)) {
    return { delivered: false, reason: "cooldown" };
  }

  try {
    const response = await (options?.fetcher ?? fetch)(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "carver-ai",
        event: alert.event,
        severity: alert.severity,
        occurredAt: new Date(now).toISOString(),
        metadata: redactLogValue(alert.metadata ?? {}),
      }),
    });

    if (!response.ok) {
      return { delivered: false, reason: "delivery_failed" };
    }

    lastSentAtByKey.set(cooldownKey, now);
    return { delivered: true };
  } catch {
    return { delivered: false, reason: "delivery_failed" };
  }
}
