type Closable = {
  close: () => Promise<void>;
};

type PausableClosable = Closable & {
  pause: () => Promise<void>;
};

export class WorkerShutdownTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Worker shutdown exceeded ${timeoutMs}ms.`);
    this.name = "WorkerShutdownTimeoutError";
  }
}

export function createGracefulShutdownCoordinator(params: {
  worker?: PausableClosable | null;
  healthServer: Closable & { markShuttingDown: () => void };
  stopAiJobOutboxDispatcher?: () => void;
  stopLibrarySyncScheduler: () => void;
  stopR2OrphanCleanupScheduler?: () => void;
  stopStalledJobReconciliation: () => void;
  stopWorkerEvents?: () => Promise<void>;
  timeoutMs: number;
  onTimeout: () => void;
}) {
  let shutdownPromise: Promise<void> | null = null;

  return () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      params.healthServer.markShuttingDown();
      params.stopAiJobOutboxDispatcher?.();
      params.stopLibrarySyncScheduler();
      params.stopR2OrphanCleanupScheduler?.();
      params.stopStalledJobReconciliation();

      let timeout: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          params.onTimeout();
          reject(new WorkerShutdownTimeoutError(params.timeoutMs));
        }, params.timeoutMs);
      });

      const closeResources = async () => {
        // pause() waits for active work before close(), so a deploy does not
        // abandon a generation while the worker is still healthy.
        await params.worker?.pause();
        await Promise.all([
          params.stopWorkerEvents?.().catch(() => undefined),
          params.healthServer.close().catch(() => undefined),
        ]);
        await params.worker?.close();
      };

      try {
        await Promise.race([closeResources(), deadline]);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    })();

    return shutdownPromise;
  };
}
