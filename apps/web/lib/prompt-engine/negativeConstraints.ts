/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import type { LandscapeTaskType } from "./types";

export function getNegativeConstraints(taskType: LandscapeTaskType, referenceImages: unknown[] = []) {
  const constraints = [
    "Do not redesign the whole site.",
    "Do not change the camera angle.",
    "Do not move existing objects.",
    "Do not change the pond shape.",
    "Do not remove bridge, gazebo, walls, paths, houses, or hardscape.",
    "Do not add random unrelated plants.",
    "Do not make the garden overgrown.",
    "Do not create jungle-style planting unless requested.",
    "Do not add extra buildings.",
    "Do not change the scale of existing structures.",
    "Do not blur or reduce image quality.",
    "Do not modify unrelated areas.",
  ];

  if (referenceImages.length > 0) constraints.push("Do not ignore the reference image if provided.");
  if (taskType === "house_replacement") constraints.push("Do not affect the surrounding garden or hardscape.");
  if (taskType === "courtyard_paving") constraints.push("Do not move houses, plants, pond, paths, walls, or objects.");
  if (taskType === "koi_pond_edge_design") constraints.push("Do not use concrete edge, round pebble border, or glossy stones.");

  return constraints;
}

