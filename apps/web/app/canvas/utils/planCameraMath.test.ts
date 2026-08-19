import assert from "node:assert/strict";
import test from "node:test";
import {
  getPitchDegrees,
  getPlanWorldSize,
  planPointToWorld,
  resolvePlanTargetWorld,
  worldPointToPlan,
} from "./planCameraMath";

test("plan camera coordinates round-trip beyond the image bounds", () => {
  const size = getPlanWorldSize(2);
  const world = planPointToWorld(1.2, -0.1, 3.4, size);
  const plan = worldPointToPlan(world, size);

  assert.ok(Math.abs(plan.u - 1.2) < 0.000001);
  assert.ok(Math.abs(plan.v + 0.1) < 0.000001);
  assert.equal(plan.z, 3.4);
});

test("legacy pitch resolves a target elevation until an explicit elevation exists", () => {
  const size = getPlanWorldSize(1);
  const target = resolvePlanTargetWorld({
    u: 0.5,
    v: 0.25,
    targetU: 0.5,
    targetV: 0.5,
    height: 2,
    lens: 28,
    pitch: -45,
    viewDirection: "look-at-target",
  }, size);

  assert.ok(Math.abs(target.z + 1) < 0.000001);
});

test("pitch is derived from the camera-to-target vector", () => {
  assert.equal(getPitchDegrees({ x: 0, y: 0, z: 2 }, { x: 2, y: 0, z: 0 }), -45);
});
