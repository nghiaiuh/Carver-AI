import assert from "node:assert/strict";
import test from "node:test";
import {
  clampOrbitTilt,
  orbitTransformToWorld,
  worldPointToOrbit,
  wrapOrbitDegrees,
} from "./orbitCameraMath";

const closeTo = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be close to ${expected}`);
};

test("orbit cardinal angles occupy distinct positions around the image", () => {
  const front = orbitTransformToWorld({ rotate: 0, tilt: 0, distance: 10 });
  const right = orbitTransformToWorld({ rotate: 90, tilt: 0, distance: 10 });
  const back = orbitTransformToWorld({ rotate: 180, tilt: 0, distance: 10 });
  const left = orbitTransformToWorld({ rotate: -90, tilt: 0, distance: 10 });

  closeTo(front.z, 10);
  closeTo(right.x, 10);
  closeTo(back.z, -10);
  closeTo(left.x, -10);
});

test("orbit coordinates round-trip through world space", () => {
  const world = orbitTransformToWorld({ rotate: 137, tilt: 42, distance: 8.4 });
  const orbit = worldPointToOrbit(world);

  closeTo(orbit.rotate, 137);
  closeTo(orbit.tilt, 42);
  closeTo(orbit.distance, 8.4);
});

test("orbit angles wrap horizontally and clamp away from the poles", () => {
  assert.equal(wrapOrbitDegrees(270), -90);
  assert.equal(wrapOrbitDegrees(-270), 90);
  assert.equal(clampOrbitTilt(100), 80);
  assert.equal(clampOrbitTilt(-100), -80);
});
