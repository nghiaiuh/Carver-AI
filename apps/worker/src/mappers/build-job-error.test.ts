import assert from "node:assert/strict";
import test from "node:test";
import { buildJobError, toWorkerError } from "./build-job-error";

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
