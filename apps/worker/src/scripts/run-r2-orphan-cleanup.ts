import { loadWorkerEnvFiles } from "../config/load-worker-env";
import { validateWorkerEnv } from "../config/worker-env";
import { runR2OrphanCleanup } from "../services/r2-orphan-cleanup-service";

async function main() {
  loadWorkerEnvFiles();
  validateWorkerEnv();

  const result = await runR2OrphanCleanup();
  // Counts only: never print object keys, paths, prompts, or credentials.
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error) => {
  const details = error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown; message?: unknown }
    : null;
  const reason = [details?.code, details?.name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?? "unknown error";
  process.stderr.write(`R2 orphan cleanup failed: ${reason}\n`);
  process.exitCode = 1;
});
