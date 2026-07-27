import assert from "node:assert/strict";
import test from "node:test";
import { getOpenAiImageRequestTimeoutMs } from "./generate-image";

test("OpenAI image request timeout uses a safe bounded configuration", () => {
  assert.equal(getOpenAiImageRequestTimeoutMs("15000"), 15_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("9999"), 240_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("601000"), 240_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("invalid"), 240_000);
});
