import type { CarverAiJobPayload, CarverAiJobSimulationConfig } from "@carver/shared";

type SimulatedGeneratedImage = {
  buffer: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  revisedPrompt: string | null;
  provider: string;
};

const DEFAULT_SIMULATION_DELAY_MS = 400;
const SLOW_SIMULATION_DELAY_MS = 3_500;
const SIMULATION_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oN2VNcAAAAASUVORK5CYII=";

function resolveSimulationDelay(config: CarverAiJobSimulationConfig) {
  if (typeof config.delayMs === "number" && Number.isFinite(config.delayMs) && config.delayMs >= 0) {
    return config.delayMs;
  }

  return config.scenario === "slow_success" ? SLOW_SIMULATION_DELAY_MS : DEFAULT_SIMULATION_DELAY_MS;
}

async function wait(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isAiJobSimulationEnabled() {
  return process.env.CARVER_ENABLE_AI_JOB_SIMULATION === "true" || process.env.NODE_ENV !== "production";
}

/**
 * A deterministic post-persist failure lets staging prove that a BullMQ retry
 * reuses the same output asset instead of making a second provider request.
 */
export function shouldFailAfterPersistedOutput(
  simulation: CarverAiJobSimulationConfig | null | undefined,
  currentAttempt: number,
) {
  return simulation?.scenario === "fail_after_asset_persisted_once" && currentAttempt === 1;
}

export function shouldSimulateProviderTimeout(
  simulation: CarverAiJobSimulationConfig | null | undefined,
  currentAttempt: number,
) {
  return simulation?.scenario === "timeout_then_success" && currentAttempt === 1;
}

export async function generateSimulatedImage(params: {
  job: CarverAiJobPayload;
  prompt: string;
  currentAttempt: number;
}) : Promise<SimulatedGeneratedImage> {
  const simulation = params.job.simulation;
  if (!simulation) {
    throw new Error("Simulation config is required for simulated image generation.");
  }

  if (!isAiJobSimulationEnabled()) {
    throw new Error("invalid simulation failure: AI job simulation mode is disabled.");
  }

  await wait(resolveSimulationDelay(simulation));

  if (simulation.scenario === "permanent_fail") {
    throw new Error("invalid simulation failure: benchmark permanent failure.");
  }

  if (shouldSimulateProviderTimeout(simulation, params.currentAttempt)) {
    throw new Error("OpenAI image request timed out after the simulated deadline.");
  }

  if (simulation.scenario === "transient_provider_fail_then_success") {
    const failUntilAttempt = Math.max(1, simulation.failUntilAttempt ?? 1);
    if (params.currentAttempt <= failUntilAttempt) {
      throw new Error("temporary simulation failure: benchmark transient provider failure.");
    }
  }

  return {
    buffer: Buffer.from(SIMULATION_PNG_BASE64, "base64"),
    mimeType: "image/png",
    width: 1,
    height: 1,
    revisedPrompt: `Simulated output for: ${params.prompt}`,
    provider: `carver-simulation:${simulation.scenario}`,
  };
}
