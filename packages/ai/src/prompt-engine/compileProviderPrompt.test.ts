import assert from "node:assert/strict";
import test from "node:test";

import type { PromptPlanV2 } from "@carver/shared";
import { compileProviderPromptV2 } from "./compileProviderPrompt";

const buildPlan = (): PromptPlanV2 => ({
  schemaVersion: 2,
  purpose: "generation",
  executionMode: "image_edit",
  rawGoal: "RAW_GOAL_SENTINEL: renew only the walkway material.",
  operations: [
    {
      operationId: "op-material",
      type: "replace_material",
      targetContextId: "walkway-target",
      material: "OPERATION_SENTINEL basalt pavers",
    },
  ],
  target: {
    value: {
      contextId: "walkway-target",
      title: "Walkway target",
      source: "canvas_target",
    },
    source: "trusted_context",
    evidence: ["trusted-target:walkway-target"],
  },
  references: [
    {
      contextId: "REFERENCE_SENTINEL",
      requestedRole: "material",
      effectiveRole: "material",
      graphRole: "material_reference",
      source: "trusted_context",
      validation: "trusted_graph_match",
      evidence: ["trusted-reference:REFERENCE_SENTINEL"],
    },
  ],
  constraints: [
    {
      id: "protected-region",
      type: "preserve_region",
      source: "system_policy",
      severity: "hard",
      regionId: "region-protected",
      description: "HARD_CONSTRAINT_SENTINEL: preserve the pond edge exactly.",
    },
    {
      id: "limited-scope",
      type: "restrict_edit_scope",
      source: "user_explicit",
      severity: "soft",
      description: "SOFT_CONSTRAINT_SENTINEL: change only the walkway surface.",
    },
  ],
  decision: "continue",
  risk: { level: "low", reasons: [] },
  reviewReasons: [],
  degraded: false,
});

test("orbit compiler preserves the full approved plan alongside novel-view instructions", () => {
  const prompt = compileProviderPromptV2({
    ...buildPlan(),
    cameraShot: {
      shotSetNodeId: "camera-set-1",
      shotId: "orbit-1",
      shotName: "Orbit sentinel",
      order: 0,
      mode: "orbit",
      orbit: { rotate: -42, tilt: 0, distance: 8, lens: 35 },
    },
  });

  assert.match(prompt, /VIEWPOINT RECONSTRUCTION/);
  assert.match(prompt, /APPROVED SEMANTIC PLAN/);
  assert.match(prompt, /RAW_GOAL_SENTINEL/);
  assert.match(prompt, /OPERATION_SENTINEL basalt pavers/);
  assert.match(prompt, /REFERENCE_SENTINEL/);
  assert.match(prompt, /HARD_CONSTRAINT_SENTINEL/);
  assert.match(prompt, /region=region-protected/);
  assert.match(prompt, /SOFT_CONSTRAINT_SENTINEL/);
});

test("plan compiler keeps target height and view-direction semantics distinguishable", () => {
  const basePlan = buildPlan();
  const firstPrompt = compileProviderPromptV2({
    ...basePlan,
    cameraShot: {
      shotSetNodeId: "camera-set-1",
      shotId: "plan-1",
      shotName: "Plan one",
      order: 0,
      mode: "plan",
      plan: {
        u: 0.2,
        v: 0.3,
        targetU: 0.7,
        targetV: 0.8,
        height: 6,
        targetHeight: 0,
        lens: 35,
        pitch: -10,
        roll: 0,
        viewDirection: "look-at-target",
      },
    },
  });
  const secondPrompt = compileProviderPromptV2({
    ...basePlan,
    cameraShot: {
      shotSetNodeId: "camera-set-1",
      shotId: "plan-2",
      shotName: "Plan two",
      order: 1,
      mode: "plan",
      plan: {
        u: 0.2,
        v: 0.3,
        targetU: 0.7,
        targetV: 0.8,
        height: 6,
        targetHeight: 3,
        lens: 35,
        pitch: -10,
        roll: 0,
        viewDirection: "manual",
      },
    },
  });

  assert.match(firstPrompt, /target height is 0\.00 relative world units/);
  assert.match(firstPrompt, /View direction mode=look-at-target/);
  assert.match(firstPrompt, /derive the pitch from that vector/);
  assert.match(firstPrompt, /RAW_GOAL_SENTINEL/);
  assert.match(firstPrompt, /OPERATION_SENTINEL basalt pavers/);
  assert.match(firstPrompt, /REFERENCE_SENTINEL/);
  assert.match(firstPrompt, /HARD_CONSTRAINT_SENTINEL/);
  assert.match(secondPrompt, /target height is 3\.00 relative world units/);
  assert.match(secondPrompt, /View direction mode=manual/);
  assert.match(secondPrompt, /author-defined manual framing/);
  assert.notEqual(firstPrompt, secondPrompt);
});

test("default compiler renders the same approved plan sections", () => {
  const prompt = compileProviderPromptV2(buildPlan());

  assert.match(prompt, /MAIN GOAL/);
  assert.match(prompt, /RAW_GOAL_SENTINEL/);
  assert.match(prompt, /APPROVED OPERATIONS/);
  assert.match(prompt, /OPERATION_SENTINEL basalt pavers/);
  assert.match(prompt, /VALIDATED REFERENCES/);
  assert.match(prompt, /REFERENCE_SENTINEL/);
  assert.match(prompt, /HARD_CONSTRAINT_SENTINEL/);
});
