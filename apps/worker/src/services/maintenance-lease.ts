/*
 * Coordinates scheduled maintenance across replicas. A process-level
 * `inFlight` flag prevents overlap locally; this lease prevents duplicate work
 * when deployment overlap or multiple maintenance replicas occur.
 */

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";

const logger = createSafeLogger("worker.maintenance-lease");

type MaintenanceLeaseRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: boolean | null;
    error: { code?: string | null; message: string } | null;
  }>;
};

export class MaintenanceLeaseError extends Error {
  constructor(
    readonly failureCode: "MAINTENANCE_LEASE_CLAIM_FAILED",
    readonly databaseCode: string | null,
  ) {
    super(failureCode);
  }
}

export type RunWithMaintenanceLease = <T>(
  taskName: string,
  action: () => Promise<T>,
) => Promise<T | undefined>;

const readLeaseSeconds = () => {
  const value = Number(process.env.WORKER_MAINTENANCE_LEASE_SECONDS ?? 120);
  return Number.isInteger(value) && value >= 15 && value <= 3_600 ? value : 120;
};

export function createMaintenanceLeaseRunner(holderId = `${process.env.HOSTNAME ?? "worker"}:${process.pid}:${randomUUID()}`): RunWithMaintenanceLease {
  const leaseSeconds = readLeaseSeconds();
  const client = getSupabaseAdmin() as unknown as MaintenanceLeaseRpcClient;

  return async <T>(taskName: string, action: () => Promise<T>) => {
    const { data: acquired, error: acquireError } = await client.rpc("claim_worker_maintenance_lease", {
      target_task_name: taskName,
      target_holder_id: holderId,
      target_lease_seconds: leaseSeconds,
    });

    if (acquireError) {
      // Keep the database message out of process logs; callers only need the
      // stable operation and PostgREST/Postgres code to diagnose migrations.
      throw new MaintenanceLeaseError("MAINTENANCE_LEASE_CLAIM_FAILED", acquireError.code ?? null);
    }

    if (!acquired) {
      logger.info("maintenance task skipped because another worker holds the lease", { taskName });
      return undefined;
    }

    // Long sync/cleanup runs can exceed the initial lease. Renewing the same
    // holder is atomic in the RPC and prevents a second replica from starting
    // the same sweep while this process is still making progress.
    const renewalInterval = setInterval(() => {
      void client.rpc("claim_worker_maintenance_lease", {
        target_task_name: taskName,
        target_holder_id: holderId,
        target_lease_seconds: leaseSeconds,
      }).then(({ data: renewed, error }) => {
        if (error || !renewed) {
          logger.warn("maintenance lease renewal failed", {
            taskName,
            error,
          });
        }
      }).catch((error) => {
        logger.warn("maintenance lease renewal threw", { taskName, error });
      });
    }, Math.max(5_000, Math.floor(leaseSeconds * 500)));
    renewalInterval.unref?.();

    try {
      return await action();
    } finally {
      clearInterval(renewalInterval);
      const { error: releaseError } = await client.rpc("release_worker_maintenance_lease", {
        target_task_name: taskName,
        target_holder_id: holderId,
      });

      if (releaseError) {
        logger.warn("maintenance lease release failed; it will expire automatically", {
          taskName,
          error: releaseError,
        });
      }
    }
  };
}
