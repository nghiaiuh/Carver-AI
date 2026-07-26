/*
 * Flow: Exposes process liveness and dependency readiness for Railway.
 * 1. /healthz proves the Node process can answer HTTP.
 * 2. /readyz checks Redis and Supabase without invoking paid AI providers.
 * 3. Responses contain status only; no keys, URLs, or provider payloads.
 */

import { createServer, type Server } from "node:http";
import { getSupabaseAdmin } from "@carver/db/server";
import { createAiJobQueue } from "@carver/queue";
import { createSafeLogger } from "@carver/shared";

const logger = createSafeLogger("worker.health");
const READINESS_TIMEOUT_MS = 5_000;

type WorkerReadiness = {
  ready: boolean;
  checks: {
    redis: "ok" | "failed";
    supabase: "ok" | "failed";
  };
};

const readPort = () => {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("WORKER_HEALTH_PORT must be a valid TCP port.");
  }

  return port;
};

async function checkReadiness(): Promise<WorkerReadiness> {
  const checks: WorkerReadiness["checks"] = { redis: "failed", supabase: "failed" };
  let queue: ReturnType<typeof createAiJobQueue> | null = null;

  try {
    queue = createAiJobQueue();
    await queue.waitUntilReady();
    const client = await queue.client;
    await client.ping();
    checks.redis = "ok";
  } catch (error) {
    logger.error("readiness redis check failed", { error });
  } finally {
    await queue?.close().catch(() => undefined);
  }

  try {
    const { error } = await getSupabaseAdmin().from("projects").select("id").limit(1);
    if (error) {
      throw error;
    }
    checks.supabase = "ok";
  } catch (error) {
    logger.error("readiness supabase check failed", { error });
  }

  return {
    ready: checks.redis === "ok" && checks.supabase === "ok",
    checks,
  };
}

async function checkReadinessWithinDeadline() {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      checkReadiness(),
      new Promise<WorkerReadiness>((resolve) => {
        timeout = setTimeout(
          () => resolve({ ready: false, checks: { redis: "failed", supabase: "failed" } }),
          READINESS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

const sendJson = (response: import("node:http").ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
};

export function startWorkerHealthServer() {
  const port = readPort();
  let shuttingDown = false;

  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://worker.local").pathname;

    if (path === "/healthz") {
      sendJson(response, shuttingDown ? 503 : 200, { status: shuttingDown ? "shutting_down" : "ok" });
      return;
    }

    if (path === "/readyz") {
      void checkReadinessWithinDeadline()
        .then((result) => {
          sendJson(response, result.ready && !shuttingDown ? 200 : 503, {
            status: result.ready && !shuttingDown ? "ready" : "not_ready",
            checks: result.checks,
          });
        })
        .catch((error) => {
          logger.error("readiness request failed", { error });
          sendJson(response, 503, {
            status: "not_ready",
            checks: { redis: "failed", supabase: "failed" },
          });
        });
      return;
    }

    sendJson(response, 404, { status: "not_found" });
  });

  server.listen(port, "0.0.0.0");
  logger.info("worker health server listening", { port });

  return {
    markShuttingDown: () => {
      shuttingDown = true;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
