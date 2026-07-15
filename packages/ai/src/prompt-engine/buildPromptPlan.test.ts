import assert from "node:assert/strict";
import test from "node:test";

import type { PromptEngineTrustedContext, PromptInterpreterMeta, PromptWarning } from "@carver/shared";
import { buildPromptPlanV2 } from "./buildPromptPlan";

const interpreter: PromptInterpreterMeta = {
  model: null,
  latencyMs: null,
  attemptCount: 0,
  fallbackReason: null,
};

function createContext(overrides: Partial<PromptEngineTrustedContext> = {}): PromptEngineTrustedContext {
  return {
    contextRevision: 3,
    executionMode: "image_edit",
    target: {
      contextId: "target-1",
      title: "Front Garden",
      source: "canvas_target",
    },
    availableTargets: [
      {
        contextId: "target-1",
        title: "Front Garden",
        source: "canvas_target",
      },
    ],
    availableReferences: [
      {
        contextId: "ref-style",
        title: "Japanese reference",
        allowedRoles: ["style", "composition", "unspecified"],
        source: "image_reference",
        graphRole: "style_reference",
      },
    ],
    selectedObjectIds: [],
    selectedRegionIds: [],
    lockedObjectIds: ["house-1"],
    locks: [
      {
        id: "lock-house-1",
        targetType: "object",
        targetId: "house-1",
        type: "position",
        strength: "hard",
        reason: "Do not move the house.",
      },
    ],
    mask: null,
    ...overrides,
  };
}

test("rejects region edit when mask is required but missing", () => {
  const warnings: PromptWarning[] = [];
  const plan = buildPromptPlanV2({
    purpose: "generation",
    rawPrompt: "change only the selected region to autumn",
    trustedContext: createContext({
      executionMode: "region_edit",
      mask: {
        required: true,
      },
    }),
    interpretation: {
      executionMode: "region_edit",
      targetHint: "target-1",
      operations: [
        {
          type: "restyle",
          targetContextId: "target-1",
          style: "golden autumn",
        },
      ],
      references: [],
      preserveRequests: [],
      avoidRequests: [],
      notes: [],
    },
    degraded: false,
    warnings,
    interpreter,
  });

  assert.equal(plan.decision, "reject");
  assert.equal(plan.risk.level, "blocked");
});

test("adjusts invalid reference role instead of silently accepting it", () => {
  const warnings: PromptWarning[] = [];
  const plan = buildPromptPlanV2({
    purpose: "generation",
    rawPrompt: "match the style reference but keep the layout",
    trustedContext: createContext(),
    interpretation: {
      executionMode: "image_edit",
      targetHint: "target-1",
      operations: [
        {
          type: "restyle",
          targetContextId: "target-1",
          style: "minimalist japanese garden",
        },
      ],
      references: [
        {
          contextId: "ref-style",
          requestedRole: "material",
        },
      ],
      preserveRequests: [],
      avoidRequests: [],
      notes: [],
    },
    degraded: false,
    warnings,
    interpreter,
  });

  assert.equal(plan.references[0]?.validation, "role_adjusted");
  assert.ok(warnings.some((warning) => warning.code === "INVALID_REFERENCE_ROLE"));
});
