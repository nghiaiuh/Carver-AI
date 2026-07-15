import assert from "node:assert/strict";
import test from "node:test";

import type { PromptPlanV2 } from "@carver/shared";
import { buildPlanHash, canonicalizePromptPlan } from "./canonicalizePlan";
import { compileProviderPromptV2 } from "./compileProviderPrompt";

const basePlan: PromptPlanV2 = {
  schemaVersion: 2,
  purpose: "generation",
  executionMode: "image_edit",
  rawGoal: "restyle the front garden into a Japanese courtyard",
  operations: [
    {
      operationId: "b",
      type: "restyle",
      targetContextId: "target-1",
      style: "japanese courtyard",
      dependsOn: ["a"],
    },
    {
      operationId: "a",
      type: "replace_material",
      targetContextId: "target-1",
      material: "gray stepping stones",
    },
  ],
  target: {
    value: {
      contextId: "target-1",
      title: "Front Garden",
      source: "canvas_target",
    },
    source: "trusted_context",
    evidence: ["trusted-target:target-1"],
  },
  references: [],
  constraints: [
    {
      id: "c-2",
      type: "preserve_layout",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the overall site layout and footprint.",
    },
    {
      id: "c-1",
      type: "preserve_camera",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the original camera angle.",
    },
  ],
  decision: "continue",
  risk: {
    level: "medium",
    reasons: [],
  },
  reviewReasons: [],
  degraded: false,
};

test("canonicalization produces stable ordering and hash for semantically equivalent plans", () => {
  const variantPlan: PromptPlanV2 = {
    ...basePlan,
    operations: [...basePlan.operations].reverse(),
    constraints: [...basePlan.constraints].reverse(),
  };

  const canonicalA = canonicalizePromptPlan(basePlan);
  const canonicalB = canonicalizePromptPlan(variantPlan);
  const promptA = compileProviderPromptV2(canonicalA);
  const promptB = compileProviderPromptV2(canonicalB);

  assert.equal(JSON.stringify(canonicalA), JSON.stringify(canonicalB));
  assert.equal(promptA, promptB);
  assert.equal(
    buildPlanHash({ plan: canonicalA, providerPrompt: promptA }),
    buildPlanHash({ plan: canonicalB, providerPrompt: promptB }),
  );
});
