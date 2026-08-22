import assert from "node:assert/strict";
import test from "node:test";
import { compileProviderPromptV2 } from "@carver/ai/prompt-engine";
import type { CameraShotDirective, PromptPlanV2 } from "@carver/shared";
import { buildCameraShotPrompt } from "./generation-service";

const baseDirection = "Render a contemporary tropical courtyard with a reflective pond, pale limestone paving, and layered planting.";

const shot: CameraShotDirective = {
  shotSetNodeId: "multi-angles-demo",
  shotId: "camera-left-corner",
  shotName: "Left corner",
  order: 1,
  mode: "orbit",
  orbit: {
    rotate: -42,
    tilt: -18,
    distance: 7.5,
    lens: 28,
  },
};

const buildPreviewPlan = (): PromptPlanV2 => ({
  schemaVersion: 2,
  purpose: "generation",
  executionMode: "image_edit",
  rawGoal: buildCameraShotPrompt(baseDirection, shot),
  cameraShot: shot,
  operations: [],
  target: {
    value: {
      contextId: "site-image",
      title: "Existing courtyard",
      assetId: "11111111-1111-4111-8111-111111111111",
      role: "direct_edit_target",
      source: "canvas_target",
    },
    source: "trusted_context",
    evidence: ["canvas target"],
  },
  references: [],
  constraints: [
    {
      id: "camera-shot-left-corner",
      type: "apply_camera_view",
      source: "trusted_context",
      severity: "hard",
      subjectId: shot.shotId,
      description: "Apply the authorized left-corner camera view; preserve site layout and scene identity.",
    },
    {
      id: "preserve-layout",
      type: "preserve_layout",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the overall site layout and footprint.",
    },
  ],
  decision: "continue",
  risk: { level: "low", reasons: [] },
  reviewReasons: [],
  degraded: false,
});

test("multi-angle preview renders a single provider-ready camera prompt", () => {
  const providerPrompt = compileProviderPromptV2(buildPreviewPlan());

  assert.match(providerPrompt, /Generate exactly shot 2: Left corner/);
  assert.match(providerPrompt, /azimuth -42 degrees/);
  assert.match(providerPrompt, /AUTHORIZED CAMERA SHOT/);
  assert.match(providerPrompt, /apply_camera_view/);
  assert.doesNotMatch(providerPrompt, /Camera 01/);

  if (process.env.CARVER_PRINT_MULTI_ANGLE_PROMPT === "true") {
    process.stdout.write(`\n--- Multi-angle provider prompt preview ---\n${providerPrompt}\n--- End preview ---\n`);
  }
});
