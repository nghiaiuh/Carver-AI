import { normalizePrompt } from "../generate/detectTaskType";
import { ACTION_KEYWORDS, MODE_KEYWORDS, OBJECT_DICTIONARY, PRESERVE_KEYWORDS, STYLE_PRESETS, TARGET_AREA_MAP } from "./landscapeDictionaries";
import type { DetectedLandscapeContext, EnhanceMode, LandscapeIntent } from "./enhanceTypes";

const DEFAULT_PRESERVE_RULES = [
  "original camera angle",
  "original perspective",
  "original layout",
  "existing buildings unless directly targeted",
  "pond shape and position",
  "path shape and position",
  "lawn shape and position",
  "wall and fence position",
  "lighting direction",
  "all unrelated objects",
];

const DEFAULT_NEGATIVE_RULES = [
  "changing the camera angle",
  "cropping, rotating, mirroring, or zooming the image",
  "redesigning the whole scene",
  "moving existing objects",
  "changing unrelated areas",
  "distorting architecture",
  "changing pond shape",
  "turning lawn into water",
  "adding random plants everywhere",
  "creating an overgrown jungle look",
  "hiding important objects behind plants",
  "making plants too dense or chaotic",
  "changing the original composition unless requested",
];

function includesAny(prompt: string, values: string[]) {
  return values.some((value) => prompt.includes(value));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function detectIntent(prompt: string): LandscapeIntent {
  const hasReplace = includesAny(prompt, ACTION_KEYWORDS.replace_object);
  const hasRemove = includesAny(prompt, ACTION_KEYWORDS.remove_object);
  const hasAdd = includesAny(prompt, ACTION_KEYWORDS.add_object);
  const hasMaterial = includesAny(prompt, ACTION_KEYWORDS.change_material);
  const hasLighting = includesAny(prompt, ACTION_KEYWORDS.lighting_design);
  const hasRealism = includesAny(prompt, ACTION_KEYWORDS.enhance_realism);
  const hasPreserve = includesAny(prompt, ACTION_KEYWORDS.preserve_layout);
  const hasPlanting = includesAny(prompt, ACTION_KEYWORDS.planting_design);
  const hasPaving = includesAny(prompt, ACTION_KEYWORDS.paving_design);
  const hasRedesign = includesAny(prompt, ACTION_KEYWORDS.redesign_area);
  const hasKoi = includesAny(prompt, ACTION_KEYWORDS.koi_pond);
  const hasRockery = includesAny(prompt, ACTION_KEYWORDS.rockery_waterfall);
  const hasArchitecture = /(nha|house|gazebo|pavilion|wooden house)/.test(prompt);
  const hasWater = includesAny(prompt, ACTION_KEYWORDS.water_feature);

  if (hasReplace && hasArchitecture) {
    return "architecture_replace";
  }

  if (hasRockery && (hasReplace || hasRedesign || prompt.includes("keep it in the same position"))) {
    return "rockery_waterfall";
  }

  if (hasKoi && !hasAdd && !hasRemove && !hasReplace) {
    return "koi_pond";
  }

  if (hasLighting) {
    return "lighting_design";
  }

  if (hasMaterial || hasPaving) {
    return "change_material";
  }

  if (hasReplace) {
    return "replace_object";
  }

  if (hasRemove) {
    return "remove_object";
  }

  if (hasAdd) {
    return "add_object";
  }

  if (hasRealism) {
    return "enhance_realism";
  }

  if (hasPreserve) {
    return "preserve_layout";
  }

  if (hasPlanting) {
    return "planting_design";
  }

  if (hasWater) {
    return "water_feature";
  }

  if (hasRedesign) {
    return "redesign_area";
  }

  return "unknown";
}

function detectObjects(prompt: string) {
  const objects = Object.entries(OBJECT_DICTIONARY)
    .filter(([keyword]) => prompt.includes(keyword))
    .map(([, value]) => value);

  return unique(objects);
}

function detectTargetAreas(prompt: string) {
  const areas = Object.entries(TARGET_AREA_MAP)
    .filter(([keyword]) => prompt.includes(keyword))
    .map(([, value]) => value);

  return unique(areas);
}

function detectStyle(prompt: string) {
  const preset = STYLE_PRESETS.find((style) => includesAny(prompt, style.keywords));
  return preset?.name ?? null;
}

function detectPreserveDirectives(prompt: string) {
  return unique(PRESERVE_KEYWORDS.filter((keyword) => prompt.includes(keyword)));
}

function detectModeHints(prompt: string): EnhanceMode[] {
  return unique(
    (Object.entries(MODE_KEYWORDS) as Array<[EnhanceMode, string[]]>)
      .filter(([, keywords]) => includesAny(prompt, keywords))
      .map(([mode]) => mode),
  );
}

function detectMaterial(objects: string[]) {
  const materialObject = objects.find((object) =>
    /(tiles|stone|wood|concrete|gravel|limestone|paving)/i.test(object),
  );

  return materialObject ?? null;
}

function detectReplacementObject(prompt: string, detectedObjects: string[]) {
  if (!includesAny(prompt, ACTION_KEYWORDS.replace_object)) {
    return null;
  }

  if (detectedObjects.length >= 2) {
    return detectedObjects[detectedObjects.length - 1];
  }

  const segments = prompt.split(/with|bang|thanh/).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 1] : null;
}

export function getDefaultPreserveRules() {
  return [...DEFAULT_PRESERVE_RULES];
}

export function getDefaultNegativeRules() {
  return [...DEFAULT_NEGATIVE_RULES];
}

export function detectLandscapeContext(rawPrompt: string): DetectedLandscapeContext {
  const normalizedPrompt = normalizePrompt(rawPrompt.trim());
  const intent = detectIntent(normalizedPrompt);
  const objects = detectObjects(normalizedPrompt);
  const targetAreas = detectTargetAreas(normalizedPrompt);
  const style = detectStyle(normalizedPrompt);
  const detectedPreserveDirectives = detectPreserveDirectives(normalizedPrompt);
  const detectedModeHints = detectModeHints(normalizedPrompt);
  const preserveRules = getDefaultPreserveRules();
  const negativeRules = getDefaultNegativeRules();
  const material = detectMaterial(objects);
  const replacementObject = detectReplacementObject(normalizedPrompt, objects);

  if (targetAreas.includes("outside the fence")) {
    negativeRules.push("placing plants inside the garden");
  }

  if (objects.includes("fence") || objects.includes("wooden fence") || targetAreas.includes("along the fence")) {
    negativeRules.push("covering the fence completely");
  }

  if (detectedPreserveDirectives.length > 0 && !preserveRules.includes("exact object positions")) {
    preserveRules.push("exact object positions");
  }

  return {
    normalizedPrompt,
    intent,
    objects,
    targetAreas,
    style,
    preserveRules: unique(preserveRules),
    negativeRules: unique(negativeRules),
    material,
    replacementObject,
    detectedPreserveDirectives,
    detectedModeHints,
  };
}
