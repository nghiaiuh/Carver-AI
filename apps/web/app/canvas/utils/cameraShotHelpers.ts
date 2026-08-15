import type {
  CanvasCameraShot,
  CanvasCameraShotPreset,
  CanvasCameraShotSetNode,
} from "../types/canvas";

const CAMERA_SHOT_DEFINITIONS: Record<CanvasCameraShotPreset, Omit<CanvasCameraShot, "selected">> = {
  front: {
    id: "front",
    label: "Front View",
    instruction: "Use a straight-on frontal camera view. Preserve the site layout, scale, and primary focal axis.",
  },
  "eye-level": {
    id: "eye-level",
    label: "Eye-level View",
    instruction: "Use an eye-level human camera height with a natural landscape-design presentation perspective.",
  },
  "top-down": {
    id: "top-down",
    label: "Top-down View",
    instruction: "Use a controlled elevated top-down plan view that keeps the site footprint and object placement legible.",
  },
  "left-corner": {
    id: "left-corner",
    label: "Left Corner",
    instruction: "Use a three-quarter view from the left-front corner while preserving all spatial relationships.",
  },
  "right-corner": {
    id: "right-corner",
    label: "Right Corner",
    instruction: "Use a three-quarter view from the right-front corner while preserving all spatial relationships.",
  },
  "night-lighting": {
    id: "night-lighting",
    label: "Night Lighting",
    instruction: "Keep the same planned camera position, then render a dusk or night lighting study with realistic landscape illumination.",
  },
};

export const CAMERA_SHOT_PRESETS = Object.values(CAMERA_SHOT_DEFINITIONS);

export function createCameraShotSet(selectedIds: CanvasCameraShotPreset[] = ["eye-level"]) {
  const selected = new Set(selectedIds);
  return {
    shots: CAMERA_SHOT_PRESETS.map((shot) => ({
      ...shot,
      selected: selected.has(shot.id),
    })),
  };
}

export function getSelectedCameraShots(node: CanvasCameraShotSetNode) {
  return node.cameraShotSet.shots.filter((shot) => shot.selected);
}

/**
 * This is emitted through the typed text port. A future generation-family job
 * will consume each selected shot independently; a single Image Generator run
 * receives the first selected shot deterministically.
 */
export function getCameraShotSetPrompt(node: CanvasCameraShotSetNode) {
  const shot = getSelectedCameraShots(node)[0];
  if (!shot) {
    return "No camera shot is selected. Preserve the original camera and perspective.";
  }

  return [
    `CAMERA SHOT PLAN: ${shot.label}.`,
    shot.instruction,
    "Do not redesign unrelated objects, layout, scale, or spatial relationships.",
  ].join("\n");
}
