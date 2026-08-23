import assert from "node:assert/strict";
import test from "node:test";
import type { ChangeAngleOperation } from "@carver/shared";
import {
  buildChangeAnglePrompt,
  buildNovelViewGenerationRequest,
  compileCameraSemantic,
  getReconstructionRisk,
  toChangeAngleOperation,
} from "./novelViewReconstruction";

const shot: ChangeAngleOperation["shot"] = {
  id: "shot-01",
  name: "Camera 01",
  mode: "orbit",
  azimuthDeg: -41.96062127060776,
  elevationDeg: -0.06290910766336777,
  distanceM: 7.5,
  lensMm: 35,
  target: "scene_center",
};

test("camera state compiles to stable semantic viewpoint descriptions", () => {
  assert.deepEqual(compileCameraSemantic(shot), {
    horizontalView: "front-left three-quarter view",
    rotationDescription: "approximately 42° around the scene center toward the left side",
    verticalView: "eye-level view",
    elevationDescription: "keep the camera nearly level with the scene",
    perspectiveDescription:
      "natural moderately wide architectural perspective comparable to a 35 mm full-frame lens, balanced depth, limited perspective distortion",
    distanceDescription: "medium-distance framing",
    raw: {
      azimuthDeg: -42,
      elevationDeg: 0,
      distanceM: 7.5,
      lensMm: 35,
    },
  });
});

test("reconstruction risk uses normalized azimuth without becoming model prose metadata", () => {
  assert.equal(getReconstructionRisk(20), "low");
  assert.equal(getReconstructionRisk(-42), "moderate");
  assert.equal(getReconstructionRisk(90), "high");
  assert.equal(getReconstructionRisk(181), "very_high");
});

test("change-angle prompt prioritizes semantics and omits application-only shot labels", () => {
  const prompt = buildChangeAnglePrompt({ shot, sceneName: "Existing courtyard" });

  assert.match(prompt, /front-left three-quarter view/);
  assert.match(prompt, /keep the camera nearly level with the scene/);
  assert.match(prompt, /azimuth -42°, elevation 0°, virtual distance 7.5 m, 35 mm lens equivalent/);
  assert.match(prompt, /The SITE remains fixed\.\nOnly the CAMERA moves\./);
  assert.match(prompt, /changed viewpoint exposes additional scene geometry/);
  assert.doesNotMatch(prompt, /Camera 01/);
  assert.doesNotMatch(prompt, /Generate exactly shot/);
  assert.doesNotMatch(prompt, /reconstruction risk = moderate/i);
  assert.doesNotMatch(prompt, /-0\.06290910766336777/);
});

test("orbit metadata maps to a structured novel-view generation request", () => {
  const operation = toChangeAngleOperation({
    shot: {
      shotSetNodeId: "camera-set-1",
      shotId: shot.id,
      shotName: shot.name,
      order: 0,
      mode: "orbit",
      orbit: { rotate: shot.azimuthDeg, tilt: shot.elevationDeg, distance: 7.5, lens: 35 },
    },
    targetId: "node-1786445609298-0",
    targetName: "Existing courtyard",
  });

  assert.ok(operation);
  const request = buildNovelViewGenerationRequest({
    operation,
    sourceImageId: "asset-source",
    prompt: "compiled prompt",
  });

  assert.equal(request.operation, "novel_view_reconstruction");
  assert.equal(request.shotId, "shot-01");
  assert.equal(request.camera.target, "scene_center");
  assert.deepEqual(request.policy, {
    preserveSceneIdentity: true,
    preserveLayout: true,
    preserveObjectPositions: true,
    preserveMaterials: true,
    allowRedesign: false,
    allowRelocation: false,
    allowMirroring: false,
  });
});

test("additional user instructions remain subordinate to novel-view preservation policy", () => {
  const prompt = buildChangeAnglePrompt({
    shot,
    additionalUserInstruction: "Keep the pond unchanged.",
  });

  assert.match(prompt, /ADDITIONAL USER INSTRUCTION/);
  assert.match(prompt, /Keep the pond unchanged\./);
  assert.match(prompt, /must not override the camera definition or preservation rules/);
});
