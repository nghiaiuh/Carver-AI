import type {
  CanvasCameraShotPreset,
  CanvasCameraShotSetNode,
  CanvasCameraShotSetState,
  CanvasMultiAngleCamera,
  CanvasMultiAnglesMode,
} from "../types/canvas";

const LEGACY_PRESET_TRANSFORMS: Record<CanvasCameraShotPreset, Partial<CanvasMultiAngleCamera>> = {
  front: { orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 } },
  "eye-level": { orbit: { rotate: -20, tilt: -12, distance: 7.5, lens: 35 } },
  "top-down": { orbit: { rotate: 0, tilt: 62, distance: 9, lens: 28 } },
  "left-corner": { orbit: { rotate: -42, tilt: -18, distance: 7.5, lens: 28 } },
  "right-corner": { orbit: { rotate: 42, tilt: -18, distance: 7.5, lens: 28 } },
  "night-lighting": { orbit: { rotate: 28, tilt: -10, distance: 8.5, lens: 35 } },
};

export const CAMERA_SHOT_PRESETS: Array<{ id: CanvasCameraShotPreset; label: string }> = [
  { id: "front", label: "Front View" },
  { id: "eye-level", label: "Eye-level View" },
  { id: "top-down", label: "Top-down View" },
  { id: "left-corner", label: "Left Corner" },
  { id: "right-corner", label: "Right Corner" },
  { id: "night-lighting", label: "Night Lighting" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createMultiAngleCamera(index = 1, preset?: CanvasCameraShotPreset): CanvasMultiAngleCamera {
  const legacy = preset ? LEGACY_PRESET_TRANSFORMS[preset] : undefined;
  return {
    id: `camera-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Camera ${String(index).padStart(2, "0")}`,
    isVisible: true,
    plan: {
      u: clamp(0.5 + (index - 1) * 0.04, 0.08, 0.92),
      v: clamp(0.2 + (index - 1) * 0.035, 0.08, 0.92),
      targetU: 0.5,
      targetV: 0.55,
      height: 2.8,
      lens: 28,
      pitch: 0,
      viewDirection: "look-at-target",
    },
    orbit: legacy?.orbit ?? {
      rotate: -35 + (index - 1) * 30,
      tilt: -20,
      distance: 7.5,
      lens: 35,
    },
  };
}

export function createCameraShotSet(
  selectedIds: CanvasCameraShotPreset[] = ["eye-level"],
  mode: CanvasMultiAnglesMode = "orbit",
): CanvasCameraShotSetState {
  const presets: CanvasCameraShotPreset[] = selectedIds.length ? selectedIds : ["eye-level"];
  const cameras = presets.map((preset, index) => createMultiAngleCamera(index + 1, preset));
  return {
    mode,
    cameras,
    selectedCameraId: cameras[0]?.id ?? null,
    cameraDisplayMode: "ghost",
  };
}

export function getSelectedCamera(node: CanvasCameraShotSetNode) {
  return node.cameraShotSet.cameras.find((camera) => camera.id === node.cameraShotSet.selectedCameraId)
    ?? node.cameraShotSet.cameras[0]
    ?? null;
}

/** The text port stays graph-compatible while describing every ordered shot. */
export function getCameraShotSetPrompt(node: CanvasCameraShotSetNode) {
  const { cameras, mode } = node.cameraShotSet;
  if (cameras.length === 0) {
    return "No camera shots are configured. Preserve the original camera and perspective.";
  }

  const instructions = cameras.map((camera, index) => {
    if (mode === "plan") {
      const { height, lens, pitch, targetU, targetV } = camera.plan;
      return `${index + 1}. ${camera.name}: plan-surface shot at ${height.toFixed(1)} m, ${lens} mm, pitch ${pitch}°, looking at normalized plan target (${targetU.toFixed(2)}, ${targetV.toFixed(2)}).`;
    }
    const { rotate, tilt, distance, lens } = camera.orbit;
    return `${index + 1}. ${camera.name}: orbit shot, rotate ${rotate}°, tilt ${tilt}°, distance ${distance.toFixed(1)} m, ${lens} mm lens, looking at the scene center.`;
  });

  return [
    `MULTI-ANGLES (${cameras.length} ordered shots, ${mode === "plan" ? "Plan Surface" : "Orbit 360"} mode).`,
    ...instructions,
    "Preserve the connected input layout, subject placement, scale, and scene identity for every shot.",
  ].join("\n");
}
