import assert from "node:assert/strict";
import test from "node:test";

import { cameraSpecSchema } from "./api-schemas";
import {
  CameraNormalizationError,
  adaptLegacyCameraShot,
  focalLengthToHorizontalFov,
  horizontalToVerticalFov,
  normalizeAzimuthDeg,
  normalizeCameraShotDirective,
  normalizeCameraSpec,
  orbitCamera,
} from "./camera-normalization";
import type { LegacyCameraShot } from "./novel-view";
import type { CameraShotDirective } from "./prompt-engine";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

const orbitShot: LegacyCameraShot = {
  mode: "orbit",
  shotId: "orbit-1",
  orbit: { rotate: -42, tilt: -18, distance: 7.5, lens: 35 },
};

const approximately = (actual: number, expected: number, tolerance = 0.000_001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test("legacy orbit normalization is deterministic and records virtual source-relative scale", () => {
  const options = { aspectRatio: 16 / 9, inputAssetIds: [ASSET_ID] };
  const first = adaptLegacyCameraShot(orbitShot, options);
  const second = adaptLegacyCameraShot(orbitShot, options);

  assert.deepEqual(first, second);
  assert.equal(first.coordinateSpace, "source_relative");
  assert.deepEqual(first.virtualScale, {
    unit: "relative",
    calibration: "uncalibrated",
    reference: "source_frame",
  });
  assert.equal(first.authored?.azimuthDeltaDeg, -42);
  assert.equal(first.authored?.distanceRatio, 7.5);
  assert.equal(cameraSpecSchema.safeParse(first).success, true);
});

test("the adapter accepts the current snapshot-compatible camera directive shape", () => {
  const directive: CameraShotDirective = {
    shotSetNodeId: "camera-set-1",
    shotId: "camera-1",
    shotName: "Camera 01",
    order: 0,
    mode: "orbit",
    orbit: { rotate: 42, tilt: 10, distance: 7.5, lens: 35 },
  };

  const spec = adaptLegacyCameraShot(directive, { inputAssetIds: [ASSET_ID] });
  assert.equal(spec.authored?.azimuthDeltaDeg, 42);
});

test("a normalized directive carries the raw legacy transform and a schema-valid CameraSpec", () => {
  const directive: CameraShotDirective = {
    shotSetNodeId: "camera-set-1",
    shotId: "camera-1",
    shotName: "Camera 01",
    order: 0,
    mode: "orbit",
    orbit: { rotate: -42, tilt: 10, distance: 7.5, lens: 35 },
  };

  const normalized = normalizeCameraShotDirective({
    shot: directive,
    aspectRatio: 16 / 9,
    inputAssetIds: [ASSET_ID],
  });

  assert.deepEqual(normalized.orbit, directive.orbit);
  assert.equal(normalized.cameraSpec?.projection.aspectRatio, 1.777777777778);
  assert.deepEqual(normalized.cameraSpec?.provenance.inputAssetIds, [ASSET_ID]);
  assert.equal(cameraSpecSchema.safeParse(normalized.cameraSpec).success, true);
});

test("azimuth normalization makes a full 360-degree orbit round-trip to the same pose", () => {
  const zero = orbitCamera({ azimuthDeg: 0, elevationDeg: 0, distance: 4 });
  const fullTurn = orbitCamera({ azimuthDeg: 360, elevationDeg: 0, distance: 4 });
  const leftTurn = orbitCamera({ azimuthDeg: -360, elevationDeg: 0, distance: 4 });
  const zeroSpec = adaptLegacyCameraShot({
    mode: "orbit",
    orbit: { rotate: 0, tilt: 0, distance: 4, lens: 35 },
  });
  const fullTurnSpec = adaptLegacyCameraShot({
    mode: "orbit",
    orbit: { rotate: 360, tilt: 0, distance: 4, lens: 35 },
  });

  assert.equal(normalizeAzimuthDeg(360), 0);
  assert.equal(normalizeAzimuthDeg(-360), 0);
  assert.deepEqual(zero, fullTurn);
  assert.deepEqual(zero, leftTurn);
  assert.deepEqual(zeroSpec, fullTurnSpec);
});

test("legacy plan adaptation preserves handedness while converting Z-up into canonical Y-up", () => {
  const spec = adaptLegacyCameraShot({
    mode: "plan",
    plan: {
      u: 0.5,
      v: 0.25,
      targetU: 0.5,
      targetV: 0.5,
      height: 2,
      targetHeight: 0.5,
      lens: 36,
      pitch: -20,
      roll: 15,
      viewDirection: "look-at-target",
    },
  }, {
    aspectRatio: 2,
    planWorldSize: { width: 12, depth: 12 },
    inputAssetIds: [ASSET_ID],
  });

  assert.equal(spec.coordinateSpace, "plan_world");
  assert.deepEqual(spec.pose.position, [0, 2, -3]);
  assert.deepEqual(spec.pose.target, [0, 0.5, 0]);
  assert.deepEqual(spec.pose.up, [0, 1, 0]);
  assert.deepEqual(spec.virtualScale, {
    unit: "relative",
    calibration: "uncalibrated",
    reference: "plan_frame",
  });
  approximately(spec.projection.horizontalFovDeg, 53.130102354156);
  assert.equal(spec.authored?.rollDeg, 15);
});

test("FOV conversion is finite and preserves the perspective relationship", () => {
  approximately(focalLengthToHorizontalFov({ focalLengthMm: 18 }), 90);
  approximately(horizontalToVerticalFov({ horizontalFovDeg: 90, aspectRatio: 2 }), 53.130102354156);
});

test("normalization and API validation reject non-finite or incoherent camera state", () => {
  assert.throws(
    () => adaptLegacyCameraShot({
      mode: "orbit",
      orbit: { rotate: Number.NaN, tilt: 0, distance: 7.5, lens: 35 },
    }),
    CameraNormalizationError,
  );
  assert.throws(
    () => adaptLegacyCameraShot({
      mode: "plan",
      plan: {
        u: 0.5,
        v: 0.5,
        targetU: 0.5,
        targetV: 0.5,
        height: 2,
        lens: 35,
        pitch: 0,
        viewDirection: "look-at-target",
      },
    }),
    /planWorldSize/,
  );

  const valid = adaptLegacyCameraShot(orbitShot, { inputAssetIds: [ASSET_ID] });
  const invalidProjection = {
    ...valid,
    projection: { ...valid.projection, horizontalFovDeg: Number.NaN },
  };
  const invalidScale = {
    ...valid,
    virtualScale: { ...valid.virtualScale, reference: "plan_frame" as const },
  };

  assert.equal(cameraSpecSchema.safeParse(invalidProjection).success, false);
  assert.equal(cameraSpecSchema.safeParse(invalidScale).success, false);
  assert.throws(
    () => normalizeCameraSpec({
      ...valid,
      pose: { ...valid.pose, target: valid.pose.position },
    }),
    /camera forward direction/,
  );
});
