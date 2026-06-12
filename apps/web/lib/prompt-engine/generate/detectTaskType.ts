/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import type { LandscapeTaskType } from "./types";

const hasAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

export const normalizePrompt = (prompt: string) =>
  prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export function detectTaskType(rawPrompt: string): LandscapeTaskType {
  const prompt = normalizePrompt(rawPrompt);

  if (hasAny(prompt, ["doi nha", "thay nha", "mau nha", "house replacement", "replace house", "wooden house", "nha go"])) {
    return "house_replacement";
  }

  if (hasAny(prompt, ["hon non bo", "thac nuoc", "rockery", "waterfall", "da nui", "non bo"])) {
    return "rockery_replacement";
  }

  if (hasAny(prompt, ["bo ho", "vien ho", "ho koi", "pond edge", "koi pond edge"])) {
    return "koi_pond_edge_design";
  }

  if (hasAny(prompt, ["san gach", "gach xam", "gach caro", "paving", "courtyard", "tiled courtyard"])) {
    return "courtyard_paving";
  }

  if (hasAny(prompt, ["hang cay", "doc hang rao", "doc tuong", "tree row", "along fence", "along wall"])) {
    return "tree_row_addition";
  }

  if (hasAny(prompt, ["cay", "trong cay", "cay quanh ho", "bui cay", "bonsai", "tham co", "san vuon", "planting", "plants", "garden planting", "landscape vegetation"])) {
    return "planting_design";
  }

  if (hasAny(prompt, ["giong anh", "theo anh", "nhu anh toi gui", "reference image", "match reference"])) {
    return "reference_image_match";
  }

  if (hasAny(prompt, ["doi material", "vat lieu", "texture", "material", "stone material", "paving material"])) {
    return "change_material";
  }

  if (hasAny(prompt, ["anh sang", "lighting", "sunset", "morning light", "cinematic light"])) {
    return "change_lighting";
  }

  if (hasAny(prompt, ["tang chat luong", "ro net", "realistic", "photorealistic", "render quality", "sharp details"])) {
    return "enhance_quality";
  }

  if (hasAny(prompt, ["thiet ke lai toan bo", "redesign the whole", "full redesign", "entire garden", "whole garden", "whole site"])) {
    return "full_redesign";
  }

  if (hasAny(prompt, ["them ", "add "])) return "add_object";
  if (hasAny(prompt, ["xoa ", "remove "])) return "remove_object";
  if (hasAny(prompt, ["thay ", "replace "])) return "replace_object";
  if (rawPrompt.trim()) return "strict_local_edit";

  return "unknown";
}

