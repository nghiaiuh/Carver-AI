import assert from "node:assert/strict";
import test from "node:test";
import { buildJobError, toWorkerError } from "./build-job-error";
import { GenerationDecisionGateError } from "../errors/generation-decision-gate";
import { GenerationStageError } from "../errors/generation-stage-error";
import { ShotInvocationBusyError, ShotInvocationOutcomeUnknownError } from "../services/shot-invocation-service";

test("classifies transient provider and storage failures as retryable", () => {
  for (const message of [
    "OpenAI request timed out",
    "temporary simulation failure: benchmark transient provider failure",
    "fetch failed with ECONNRESET",
    "storage upload failed due to socket reset",
    "provider rate limit reached",
  ]) {
    const result = buildJobError(new Error(message));
    assert.equal(result.permanent, false, message);
  }
});

test("classifies invalid job inputs and unsupported job kinds as terminal", () => {
  for (const message of [
    "Unsupported AI job type: export",
    "invalid simulation failure: benchmark permanent failure",
    "Image edit jobs require a persisted target asset.",
    "AI job running conflict for job-id",
  ]) {
    const result = buildJobError(new Error(message));
    assert.equal(result.permanent, true, message);
  }
});

test("normalizes non-Error failures before they reach BullMQ", () => {
  assert.equal(toWorkerError("temporary network failure").message, "temporary network failure");
  assert.equal(toWorkerError(null).message, "Unknown worker failure");
});

test("does not expose raw provider or user input text in persisted error messages", () => {
  const result = buildJobError(new Error("OpenAI rejected prompt: private garden at 12 Example Street"));

  assert.equal(result.errorCode, "provider_invalid_request");
  assert.equal(result.errorMessage, "The image provider could not process this generation request.");
  assert.equal(result.errorMessage.includes("Example Street"), false);
});

test("preserves a safe provider rejection stage without exposing the provider message", () => {
  const result = buildJobError(
    new GenerationStageError("provider_request", "OpenAI rejected: private garden at 12 Example Street", {
      providerStatus: 400,
      providerCode: "invalid_request_error",
    }),
  );

  assert.equal(result.errorCode, "provider_bad_request");
  assert.equal(result.permanent, true);
  assert.equal(result.failureStage, "provider_request");
  assert.equal(result.providerStatus, 400);
  assert.equal(result.errorMessage.includes("Example Street"), false);
});

test("identifies input resolution, conditioning, and R2 persistence failures by stage", () => {
  const input = buildJobError(new GenerationStageError("input_resolution", "r2 object failed"));
  const conditioning = buildJobError(new GenerationStageError("conditioning_assembly", "unexpected source metadata"));
  const invocation = buildJobError(new GenerationStageError("shot_invocation", "claim failed"));
  const persistence = buildJobError(new GenerationStageError("asset_persistence", "storage failed"));

  assert.equal(input.errorCode, "generation_input_unavailable");
  assert.equal(conditioning.errorCode, "generation_conditioning_failed");
  assert.equal(conditioning.errorMessage.includes("source metadata"), false);
  assert.equal(invocation.errorCode, "generation_shot_state_failed");
  assert.equal(persistence.errorCode, "storage_upload_failed");
});

test("marks decision-gated jobs terminal without treating them as provider failures", () => {
  const review = buildJobError(new GenerationDecisionGateError("require_review"));
  const rejected = buildJobError(new GenerationDecisionGateError("reject"));

  assert.equal(review.errorCode, "generation_review_required");
  assert.equal(rejected.errorCode, "generation_rejected");
  assert.equal(review.permanent, true);
  assert.equal(rejected.permanent, true);
});

test("keeps ambiguous provider outcomes explicit and avoids retrying them", () => {
  const unknown = buildJobError(new ShotInvocationOutcomeUnknownError("shot-invocation:abc"));
  const busy = buildJobError(new ShotInvocationBusyError("shot-invocation:def"));

  assert.equal(unknown.errorCode, "generation_outcome_unknown");
  assert.equal(unknown.permanent, true);
  assert.equal(unknown.errorMessage.includes("shot-invocation"), false);
  assert.equal(busy.errorCode, "generation_shot_in_progress");
  assert.equal(busy.permanent, false);
});
