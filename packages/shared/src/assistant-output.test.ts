import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssistantCardOutputInstruction,
  renderAssistantCardOutput,
} from "./assistant-output";

test("Assistant list output renders stable numbered entries", () => {
  const output = renderAssistantCardOutput({
    expectedFormat: "list",
    raw: '{"format":"list","items":["Preserve the existing pond.","Use shade-tolerant planting."],"text":""}',
  });

  assert.equal(output, "1. Preserve the existing pond.\n2. Use shade-tolerant planting.");
  assert.match(getAssistantCardOutputInstruction("list"), /\"format\":\"list\"/);
});

test("Assistant text output preserves concise prose and rejects a mismatched mode", () => {
  const output = renderAssistantCardOutput({
    expectedFormat: "text",
    raw: '{"format":"text","items":[],"text":"Keep the existing path and layer low planting along its edge."}',
  });

  assert.equal(output, "Keep the existing path and layer low planting along its edge.");
  assert.match(getAssistantCardOutputInstruction("text"), /\"format\":\"text\"/);
  assert.throws(() =>
    renderAssistantCardOutput({
      expectedFormat: "list",
      raw: '{"format":"text","items":[],"text":"Wrong format."}',
    }),
  );
});
