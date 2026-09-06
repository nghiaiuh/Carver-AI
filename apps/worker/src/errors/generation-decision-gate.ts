import type { ExecutionDecision } from "@carver/shared";

export class GenerationDecisionGateError extends Error {
  constructor(
    readonly decision: Exclude<ExecutionDecision, "continue">,
  ) {
    super(`Generation decision gate blocked provider execution: ${decision}.`);
    this.name = "GenerationDecisionGateError";
  }
}
