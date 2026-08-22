import assert from "node:assert/strict";
import test from "node:test";
import type { PromptEngineTrustedContext, PromptInterpreterResult } from "@carver/shared";
import { buildPlanConstraints } from "./constraints";

const interpreter: PromptInterpreterResult = {
  operations: [],
  references: [],
  preserveRequests: [],
  avoidRequests: [],
  notes: [],
};

const context: PromptEngineTrustedContext = {
  contextRevision: 1,
  executionMode: "image_edit",
  target: null,
  availableTargets: [],
  availableReferences: [],
  selectedObjectIds: [],
  selectedRegionIds: [],
  lockedObjectIds: [],
  locks: [
    { id: "camera-lock", targetType: "camera", type: "camera", strength: "hard", reason: "Preserve original camera" },
    { id: "layout-lock", targetType: "global", type: "layout", strength: "hard", reason: "Preserve layout" },
  ],
  mask: null,
};

test("an authorized camera shot replaces camera preservation while retaining layout preservation", () => {
  const constraints = buildPlanConstraints({
    trustedContext: {
      ...context,
      cameraShot: {
        shotSetNodeId: "camera-set-1",
        shotId: "camera-1",
        shotName: "Front",
        order: 0,
        mode: "orbit",
        orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 },
      },
    },
    interpretation: interpreter,
    operations: [],
  });

  assert.ok(constraints.some((constraint) => constraint.type === "apply_camera_view"));
  assert.ok(constraints.some((constraint) => constraint.type === "preserve_layout"));
  assert.equal(constraints.some((constraint) => constraint.type === "preserve_camera"), false);
  assert.equal(constraints.some((constraint) => constraint.type === "preserve_perspective"), false);
});
