/*
 * Flow: Provides redacted structured logging for web APIs and workers.
 * 1. Remove secrets and sensitive content before console output.
 * 2. Keep useful metadata such as requestId/jobId/status.
 * 3. Avoid leaking prompts, chat content, snapshots, base64, or signed URLs.
 */

type LogLevel = "info" | "warn" | "error";

type Jsonish =
  | string
  | number
  | boolean
  | null
  | undefined
  | Jsonish[]
  | { [key: string]: Jsonish };

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /authorization|token|secret|key|password|credential|cookie|signedurl|signed_url|urlsignature|access_key|service_role/i;
const SENSITIVE_CONTENT_KEY_PATTERN =
  /prompt|chat|content|message|snapshot|canvas_json|job_payload|image|base64|dataurl|data_url/i;
const DATA_URL_PATTERN = /^data:[^;]+;base64,/i;
const LIKELY_BASE64_PATTERN = /^[a-z0-9+/=]{120,}$/i;

function redactString(value: string): string {
  if (DATA_URL_PATTERN.test(value) || LIKELY_BASE64_PATTERN.test(value)) {
    return REDACTED;
  }

  try {
    const url = new URL(value);
    if (url.search) {
      url.search = "?redacted=1";
      return url.toString();
    }
  } catch {
    // Non-URL strings are handled below.
  }

  return value;
}

export function redactLogValue(value: unknown, keyHint = "", depth = 0): Jsonish {
  if (depth > 6) {
    return "[MAX_DEPTH]";
  }

  if (SENSITIVE_KEY_PATTERN.test(keyHint) || SENSITIVE_CONTENT_KEY_PATTERN.test(keyHint)) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      // Error messages often contain provider payloads, SQL details, URLs, or
      // user supplied text. Keep the type, not the potentially sensitive body.
      message: "[REDACTED_ERROR_MESSAGE]",
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, keyHint, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        redactLogValue(entry, key, depth + 1),
      ]),
    );
  }

  return String(value);
}

export function createSafeLogger(scope: string) {
  const write = (level: LogLevel, message: string, metadata?: Record<string, unknown>) => {
    const payload = {
      scope,
      message,
      ...(metadata ? (redactLogValue(metadata) as Record<string, Jsonish>) : {}),
    };

    if (level === "error") {
      console.error(payload);
      return;
    }

    if (level === "warn") {
      console.warn(payload);
      return;
    }

    console.info(payload);
  };

  return {
    info: (message: string, metadata?: Record<string, unknown>) => write("info", message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => write("warn", message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) => write("error", message, metadata),
  };
}
