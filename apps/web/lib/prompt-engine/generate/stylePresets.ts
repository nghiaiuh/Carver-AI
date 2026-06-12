/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

export const landscapeStylePresets = [
  "Vietnamese tropical garden",
  "Vietnamese–Korean refined garden",
  "Vietnamese–Chinese courtyard garden",
  "Japanese koi garden",
  "Modern tropical resort garden",
  "Premium residential landscape",
  "Natural rockery waterfall garden",
  "Clean minimal planting design",
] as const;

export const defaultLandscapeStyle =
  "Premium Vietnamese–Korean–Chinese refined tropical garden, clean, intentional, breathable, realistic, not overgrown.";

export function resolveStylePreset(userStylePreset?: string) {
  return userStylePreset?.trim() || defaultLandscapeStyle;
}

