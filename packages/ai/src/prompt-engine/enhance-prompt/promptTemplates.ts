import type { DetectedLandscapeContext, EnhanceMode, LandscapeIntent } from "./enhanceTypes";

function buildPreserveBlock(preserveRules: string[]) {
  return ["Preserve exactly:", ...preserveRules.map((rule) => `- ${rule}`)].join("\n");
}

function buildAvoidBlock(negativeRules: string[]) {
  return ["Avoid:", ...negativeRules.map((rule) => `- ${rule}`)].join("\n");
}

function firstOrFallback(values: string[], fallback: string) {
  return values[0] ?? fallback;
}

function joinObjects(values: string[], fallback: string) {
  return values.length > 0 ? values.join(", ") : fallback;
}

function createIntentGuidance(intent: LandscapeIntent, context: DetectedLandscapeContext, mode: EnhanceMode) {
  const targetArea = firstOrFallback(context.targetAreas, "the requested target area");
  const primaryObject = firstOrFallback(context.objects, "the requested landscape element");
  const replacementObject = context.replacementObject ?? "the requested replacement element";
  const material = context.material ?? "the requested material";
  const plantList = joinObjects(context.objects, "layered landscape plants");
  const styleLine = context.style ? ` Use a ${context.style}.` : "";

  switch (intent) {
    case "add_object":
      return `Add ${primaryObject} to ${targetArea}. Place the new element naturally within the specified area while preserving the original camera angle, perspective, layout, buildings, pond, paths, lawn shapes, walls, and all unrelated objects. Use realistic scale, natural spacing, and a refined landscape design composition.${styleLine} Avoid moving existing objects. Avoid altering unrelated areas.`;
    case "remove_object":
      return `Remove ${primaryObject} from ${targetArea}. Only remove the specified object and cleanly restore the surrounding surface, planting, wall, lawn, or paving so it looks natural. Preserve the original camera angle, layout, lighting, buildings, pond, paths, lawn shapes, and all unrelated objects. Avoid adding new objects unless necessary to repair the removed area.`;
    case "replace_object":
      return `Replace ${primaryObject} in ${targetArea} with ${replacementObject}. Keep the replacement in the exact same position, footprint, orientation, and approximate scale unless the user explicitly requests otherwise. Preserve the original camera angle, perspective, layout, surrounding landscape, buildings, pond, paths, walls, and unrelated objects. Integrate the new object naturally with realistic materials, lighting, shadows, and proportions.`;
    case "change_material":
    case "paving_design":
      return `Change the material of ${primaryObject} to ${material}. Apply the new material only to the specified target object or area. Preserve the exact layout, object positions, camera angle, perspective, lighting direction, surrounding landscape, buildings, pond, paths, lawn shapes, and all unrelated objects. The material should look realistic, clean, and consistent with the existing scene.`;
    case "enhance_realism":
      return "Improve the realism and visual quality of the scene while preserving the exact original design, camera angle, layout, object positions, architecture, pond shape, paths, lawn shapes, walls, and all existing elements. Enhance materials, lighting, shadows, water reflections, grass texture, stone texture, plant detail, and overall rendering clarity. Avoid redesigning the scene. Avoid moving, adding, or removing major objects.";
    case "planting_design":
      return `Enhance the planting design in ${targetArea} using ${plantList}. Create a refined, intentional, layered landscape composition with natural spacing, realistic plant scale, and clean visual hierarchy. Preserve the original camera angle, garden layout, buildings, pond, paths, lawn shapes, walls, hardscape, and unrelated plants. Avoid overgrown jungle density. Keep the design elegant, breathable, and premium.${styleLine}`;
    case "koi_pond":
      return `Improve the koi pond area in ${targetArea}. Preserve the exact pond shape, pond size, water position, camera angle, surrounding paths, lawn shapes, gazebo, rockery, bridge, walls, and all unrelated objects. Enhance the pond edge with natural stones, subtle aquatic planting, realistic water reflections, and refined landscape detailing. Avoid changing the pond outline. Avoid turning lawn into water.`;
    case "rockery_waterfall":
      return `Redesign the Vietnamese rockery waterfall in ${targetArea}. Keep the rockery in the exact same location and footprint. Preserve the pond shape, camera angle, surrounding garden layout, paths, lawn, gazebo, bridge, walls, and all unrelated objects. Use natural limestone rock forms, layered vertical stones, darker wet stone near water channels, moss and fern details in crevices, and realistic flowing water into the pond. Avoid moving or enlarging the rockery footprint.`;
    case "architecture_replace":
      return `Replace ${primaryObject} in ${targetArea} with ${replacementObject}. Keep the new architecture in the exact same position, footprint, orientation, and approximate height unless the user explicitly requests otherwise. Preserve the original camera angle, perspective, courtyard, driveway, garden layout, pond, paths, lawn shapes, walls, and all unrelated structures. Match realistic scale, roof form, material character, lighting, shadows, and architectural integration.`;
    case "lighting_design":
      return `Improve the garden lighting in ${targetArea}. Add subtle landscape lighting that fits naturally into the existing design, such as low garden lights, warm path lights, soft uplighting for trees, or gentle accent lighting near important landscape features. Preserve the original camera angle, layout, object positions, buildings, pond, paths, lawn shapes, walls, and all unrelated objects. Avoid changing the scene structure. Avoid making the lighting look artificial or overly bright.`;
    case "water_feature":
      return `Improve the water-feature design in ${targetArea} while keeping the overall layout stable. Preserve existing pond outlines, rockery positions, paths, planting beds, and adjacent structures. Use realistic stones, clean water edges, subtle planting, and natural integration.`;
    case "preserve_layout":
      return `Preserve the exact original layout while applying only the requested changes in ${targetArea}. Keep camera angle, perspective, object positions, pond shape, paths, lawn boundaries, buildings, walls, and unrelated areas unchanged. ${mode === "layout_preservation" ? "Prioritize strict spatial lock behavior." : "Limit the edit to the user-requested scope."}`;
    case "redesign_area":
      return `Redesign ${targetArea} while keeping the rest of the site stable. Preserve the original camera angle, perspective, surrounding architecture, pond, paths, lawn shapes, walls, and all unrelated objects. Use realistic landscape design logic, clean composition, and coherent material and planting choices.${styleLine}`;
    default:
      return `Clarify and strengthen the user's landscape request for ${targetArea} without changing the original design intent. Keep the prompt concise, spatially controlled, and suitable for ${mode.split("_").join(" ")}.`;
  }
}

export function buildRuleBasedScaffold(rawPrompt: string, context: DetectedLandscapeContext, mode: EnhanceMode) {
  const objects = context.objects.length > 0 ? context.objects.join(", ") : "none clearly detected";
  const targetAreas = context.targetAreas.length > 0 ? context.targetAreas.join(", ") : "none clearly detected";
  const style = context.style ?? "not explicitly specified";

  return [
    "Use the user's original request as the primary instruction. Do not replace or reinterpret the core request with a different task.",
    "",
    "ORIGINAL USER REQUEST",
    rawPrompt,
    "",
    "DETECTED MODE",
    mode,
    "",
    "DETECTED INTENT",
    context.intent,
    "",
    "DETECTED OBJECTS",
    objects,
    "",
    "DETECTED TARGET AREAS",
    targetAreas,
    "",
    "DETECTED STYLE",
    style,
    "",
    "RULE-BASED GUIDANCE",
    createIntentGuidance(context.intent, context, mode),
    "",
    buildPreserveBlock(context.preserveRules),
    "",
    buildAvoidBlock(context.negativeRules),
  ].join("\n\n");
}

export function buildRuleBasedEnhancedPrompt(rawPrompt: string, context: DetectedLandscapeContext) {
  return [
    rawPrompt,
    "",
    buildPreserveBlock(context.preserveRules),
    "",
    buildAvoidBlock(context.negativeRules),
  ].join("\n");
}
