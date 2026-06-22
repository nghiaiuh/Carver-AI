import { normalizePrompt } from "../generate/detectTaskType";
import type { BuildStructuredPromptInput, ImageReferenceInfo, PreservationProfile } from "./types";

const DEFAULT_MODE = "image_editing";

const DEFAULT_PRESERVATION_LINES = [
  "original camera angle",
  "original perspective",
  "original entire garden layout",
  "original paved courtyard shape and position",
  "original driveway and gate position",
  "original koi pond shape and position",
  "original pavilion / gazebo position",
  "original wooden bridge position",
  "original stepping stone path",
  "original lawn island shapes",
  "original rockery / Vietnamese rockery waterfall position",
  "original carport / canopy position",
  "original white fence position",
  "original wooden fence position",
  "original brick wall and boundary wall positions",
  "original tree rows and planting layout unless touching the edited area",
  "original overall proportions and composition",
];

const PRESERVATION_PROFILES: Record<PreservationProfile, string[]> = {
  full_garden: DEFAULT_PRESERVATION_LINES,
  architecture_edit: [
    "original camera angle",
    "original perspective",
    "original entire garden layout",
    "original building footprint and orientation unless explicitly targeted",
    "original driveway, courtyard, paths, pond, and surrounding hardscape positions",
    "original overall proportions and composition",
  ],
  planting_edit: [
    "original camera angle",
    "original perspective",
    "original garden layout",
    "original hardscape, buildings, pond, walls, and fences",
    "original overall proportions and composition",
  ],
  material_edit: [
    "original camera angle",
    "original perspective",
    "original layout and object positions",
    "original surface shape and footprint",
    "original overall proportions and composition",
  ],
  water_feature_edit: [
    "original camera angle",
    "original perspective",
    "original pond shape and position",
    "original rockery footprint and position",
    "original surrounding garden layout",
    "original overall proportions and composition",
  ],
  minimal: [
    "original camera angle",
    "original perspective",
    "original layout",
    "original overall proportions and composition",
  ],
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function firstValue(values: string[] | undefined, fallback: string) {
  return values?.[0] ?? fallback;
}

function joinList(values: string[] | undefined, fallback: string) {
  return values && values.length > 0 ? values.join(", ") : fallback;
}

function titleBlock(title: string, lines: string[]) {
  return [title, "", ...lines].join("\n");
}

function referenceDescription(reference: ImageReferenceInfo) {
  const targetObject = reference.targetObject ?? "the requested target object";
  const targetArea = reference.targetArea ? ` at ${reference.targetArea} of Image A` : "";

  switch (reference.role) {
    case "architectural_reference":
      return `${reference.imageLabel} as the architectural reference for ${targetObject}${targetArea}.`;
    case "plant_reference":
      return `${reference.imageLabel} as the plant reference for ${targetObject}${targetArea}.`;
    case "material_reference":
      return `${reference.imageLabel} as the material reference for ${targetObject}${targetArea}.`;
    case "style_reference":
      return `${reference.imageLabel} as the style reference for ${targetObject}${targetArea}.`;
    case "layout_reference":
      return `${reference.imageLabel} as the layout reference for ${targetObject}${targetArea}.`;
    default:
      return `${reference.imageLabel} as the reference for ${targetObject}${targetArea}.`;
  }
}

function normalizeAreaLabel(area: string) {
  if (area === "near the lower middle area") {
    return "LOWER MIDDLE STRUCTURE";
  }

  return `${area.replace(/^near the /, "").toUpperCase()} STRUCTURE`;
}

function findReferenceForArea(input: BuildStructuredPromptInput, area: string, index: number) {
  const references = input.references ?? [];
  return (
    references.find((reference) => reference.targetArea === area && reference.role === "architectural_reference") ??
    references.find((reference) => reference.imageLabel === (index === 0 ? "Image B" : "Image C"))
  );
}

export function isMultiReferenceArchitectureEdit(input: BuildStructuredPromptInput) {
  const references = input.references ?? [];
  const normalizedPrompt = normalizePrompt(input.originalPrompt);
  const hasTwoTargetAreas = (input.targetAreas?.length ?? 0) >= 2;
  const hasReferenceImages = references.some((reference) => reference.imageLabel === "Image B") &&
    references.some((reference) => reference.imageLabel === "Image C");
  const hasPromptHints = [
    "anh 2",
    "anh 3",
    "image b",
    "image c",
    "mep trai",
    "gan giua ben duoi",
    "lower middle",
    "left edge",
  ].some((phrase) => normalizedPrompt.includes(phrase));

  return input.intent === "architecture_replace" && hasTwoTargetAreas && (hasReferenceImages || hasPromptHints);
}

export function buildImageUsageSection(input: BuildStructuredPromptInput): string {
  if ((input.mode ?? DEFAULT_MODE) !== "image_editing") {
    return "";
  }

  const lines = ["Use Image A as the direct edit target."];
  const references = (input.references ?? []).filter((reference) => reference.imageLabel !== "Image A");

  for (const reference of references) {
    lines.push(`Use ${referenceDescription(reference)}`);
  }

  return lines.join("\n");
}

export function buildMainGoalSection(input: BuildStructuredPromptInput): string {
  const targetArea = firstValue(input.targetAreas, "the requested target area");
  const targetObject = firstValue(input.targetObjects, "the requested target object");
  const replacementObject = firstValue(input.replacementObjects, "the requested replacement object");
  const material = firstValue(input.materials, "the requested material");
  const plants = joinList(input.plants, "layered landscape planting");

  const linesByIntent: Record<string, string> = {
    add_object: `Edit the uploaded garden render and add ${targetObject} to ${targetArea}. The final result must preserve the exact overall site layout, camera angle, and garden composition while only adding the specified new element.`,
    remove_object: `Edit the uploaded garden render and remove ${targetObject} from ${targetArea}. The final result must preserve the exact overall site layout, camera angle, and garden composition while only removing the specified object and naturally repairing the surrounding area.`,
    replace_object: `Edit the uploaded garden render and replace ${targetObject} in ${targetArea} with ${replacementObject}. The final result must preserve the exact overall site layout, camera angle, and garden composition while only changing the specified target object.`,
    change_material: `Edit the uploaded garden render and change the material of ${targetObject} to ${material}. The final result must preserve the exact layout, camera angle, and all unrelated objects while only updating the specified material.`,
    enhance_realism: "Improve the realism and rendering quality of the uploaded garden render while preserving the exact original design, layout, camera angle, object positions, and overall composition.",
    planting_design: `Edit the uploaded garden render and enhance the planting composition in ${targetArea} using ${plants}. The final result must preserve the exact garden layout, camera angle, hardscape, buildings, pond, paths, and all unrelated objects.`,
    koi_pond: `Edit the uploaded garden render and improve the koi pond area in ${targetArea}. The final result must preserve the exact pond shape, pond size, pond position, camera angle, and surrounding garden layout.`,
    rockery_waterfall: `Edit the uploaded garden render and redesign the Vietnamese rockery waterfall in ${targetArea}. The final result must preserve the exact rockery location, footprint, pond shape, camera angle, and surrounding garden layout.`,
    architecture_replace: `Edit the uploaded garden render and replace the selected building structure in ${targetArea} with a new architectural design based on the provided reference or requested style. The final result must preserve the exact overall site layout, camera angle, garden composition, and all unrelated structures.`,
    unknown: "Edit the uploaded garden render according to the user's request while preserving the exact original layout, camera angle, object positions, and overall garden composition.",
  };

  return titleBlock("MAIN GOAL", [linesByIntent[input.intent] ?? linesByIntent.unknown]);
}

export function buildStrictEditingRuleSection(input: BuildStructuredPromptInput): string {
  const targetObjects = unique(input.targetObjects ?? []);
  const lines =
    targetObjects.length > 1
      ? [
          "Only change the specified target objects:",
          "",
          ...targetObjects.map((target) => target),
          "",
          "Avoid redesigning the whole site.",
          "Avoid moving or redesigning the landscape.",
          "Avoid changing unrelated buildings or objects except where necessary to integrate the replacement elements naturally.",
        ]
      : [
          "Only change the specified target area or target object.",
          "Avoid redesigning the whole site.",
          "Avoid moving or redesigning the landscape.",
          "Avoid changing unrelated buildings, planting, hardscape, or objects except where necessary to integrate the edit naturally.",
        ];

  return titleBlock("STRICT EDITING RULE", lines);
}

export function buildPreserveExactlySection(input: BuildStructuredPromptInput): string {
  const profile = input.projectContext?.preservationProfile ?? "full_garden";
  const lines = ["Strictly preserve:", "", ...PRESERVATION_PROFILES[profile], "", "Avoid moving, rotating, enlarging, shrinking, or redesigning the site layout."];
  return titleBlock("PRESERVE EXACTLY", lines);
}

export function buildTargetEditSection(input: BuildStructuredPromptInput): string {
  const targetArea = firstValue(input.targetAreas, "the requested target area");
  const targetObject = firstValue(input.targetObjects, "the requested target object");
  const replacementObject = firstValue(input.replacementObjects, "the requested replacement object");
  const material = firstValue(input.materials, "the requested material");
  const plants = joinList(input.plants, "layered landscape planting");

  if (isMultiReferenceArchitectureEdit(input)) {
    const areas = input.targetAreas ?? [];
    const blocks = areas.map((area, index) => {
      const reference = findReferenceForArea(input, area, index);
      const referenceLabel = reference?.imageLabel ?? (index === 0 ? "Image B" : "Image C");
      const heading = `BUILDING REPLACEMENT ${index + 1}`;
      const areaHeading = `${normalizeAreaLabel(area)} -> BASED ON ${referenceLabel.toUpperCase()}`;
      const locationLine =
        index === 0
          ? `Replace the house / structure at the ${area} of Image A with a new structure based closely on ${referenceLabel}.`
          : `Replace the house / structure near the ${area.replace(/^near the /, "")} of Image A with a new house design based closely on ${referenceLabel}.`;
      const characterLine =
        index === 0
          ? `The new left-side structure should follow the architectural character of ${referenceLabel}.`
          : `The new lower-middle house should clearly follow the architecture of ${referenceLabel}.`;
      const fitLine =
        index === 0
          ? `This replacement should be adapted to fit naturally into the exact footprint and position of the original left-side structure in Image A.`
          : `Adapt the house from ${referenceLabel} so it fits naturally into the existing lower-middle building position in Image A while keeping the top-view perspective.`;

      return titleBlock(heading, [areaHeading, "", locationLine, "", characterLine, "", fitLine]);
    });

    return blocks.join("\n\n");
  }

  switch (input.intent) {
    case "add_object":
      return titleBlock("NEW ELEMENT REQUIREMENT", [
        `Add ${targetObject} to ${targetArea}.`,
        "",
        "The new element should:",
        "",
        "match the original camera angle and perspective",
        "use realistic scale and proportions",
        "fit naturally into the existing landscape composition",
        "match the lighting, shadows, and render quality of the original image",
        "feel intentionally designed, not randomly placed",
      ]);
    case "remove_object":
      return titleBlock("REMOVAL REQUIREMENT", [
        `Remove ${targetObject} from ${targetArea}.`,
        "",
        "After removal, restore the surrounding area naturally using matching lawn, paving, wall, planting, soil, water, or surface detail as appropriate.",
        "",
        "The edited area should look clean, realistic, and consistent with the original scene.",
      ]);
    case "replace_object":
      return titleBlock("REPLACEMENT REQUIREMENT", [
        `Replace ${targetObject} in ${targetArea} with ${replacementObject}.`,
        "",
        "The replacement should:",
        "",
        "stay in the exact original location",
        "keep an appropriate footprint and scale",
        "match the original camera angle and perspective",
        "connect naturally to the ground or surrounding surface",
        "match the lighting and shadows of the original scene",
        "feel integrated into the site, not pasted in",
      ]);
    case "change_material":
      return titleBlock("MATERIAL CHANGE REQUIREMENT", [
        `Change the material of ${targetObject} to ${material}.`,
        "",
        "Apply the new material only to the specified target object or surface.",
        "",
        "The new material should:",
        "",
        "have realistic scale and texture",
        "follow the original surface shape",
        "match the existing lighting and perspective",
        "look clean, premium, and professionally rendered",
      ]);
    case "planting_design":
      return titleBlock("PLANTING EDIT REQUIREMENT", [
        `Enhance the planting design in ${targetArea} using ${plants}.`,
        "",
        "The planting should:",
        "",
        "create a refined and intentional landscape composition",
        "use natural spacing and realistic plant scale",
        "create clear visual layering",
        "match the existing garden style",
        "stay breathable and elegant",
        "avoid excessive density",
        "avoid an overgrown jungle look",
      ]);
    case "koi_pond":
      return titleBlock("KOI POND EDIT REQUIREMENT", [
        `Improve the koi pond area in ${targetArea}.`,
        "",
        "The pond edit should:",
        "",
        "preserve the exact pond outline",
        "preserve the water position",
        "enhance the pond edge with natural stones where appropriate",
        "add subtle aquatic or pond-edge planting where appropriate",
        "improve realistic water reflections",
        "keep the pond integrated with the surrounding garden",
        "avoid turning lawn or paving into water",
      ]);
    case "rockery_waterfall":
      return titleBlock("ROCKERY WATERFALL REQUIREMENT", [
        `Redesign or improve the Vietnamese rockery waterfall in ${targetArea}.`,
        "",
        "The rockery should:",
        "",
        "stay in the exact original location and footprint",
        "use natural limestone rock forms",
        "show layered vertical stone composition",
        "include darker wet stone near water channels",
        "include subtle moss, fern, and crevice planting details",
        "show realistic flowing water into the pond",
        "match the lighting and perspective of the original scene",
        "avoid enlarging or moving the rockery footprint",
      ]);
    case "architecture_replace":
      return titleBlock("BUILDING REPLACEMENT REQUIREMENT", [
        `Replace ${targetObject} in ${targetArea} with ${replacementObject}.`,
        "",
        "The new structure should follow the requested architectural character, especially:",
        "",
        joinList(input.styles, "the provided reference image, roof language, material character, and opening proportions"),
        "",
        "It should be adapted to fit naturally into the exact footprint and position of the original structure.",
        "",
        "Keep the replacement visually consistent with the original camera angle and perspective.",
      ]);
    default:
      return "";
  }
}

export function buildReferencePrioritySection(input: BuildStructuredPromptInput): string {
  const references = (input.references ?? []).filter((reference) => reference.imageLabel !== "Image A");
  if (references.length === 0) {
    return "";
  }

  if (references.length === 1) {
    return titleBlock("REFERENCE PRIORITY", [
      "Use the reference image only for the requested design language, material character, form, and style.",
      "",
      "Avoid copying unrelated background objects, people, text, UI elements, clutter, or temporary items from the reference image.",
    ]);
  }

  return titleBlock("REFERENCE PRIORITY", [
    "Use the references independently and clearly:",
    "",
    ...references.map((reference) => `${reference.imageLabel} only for ${reference.targetArea ?? reference.targetObject ?? "its assigned target"}`),
    "",
    "Avoid mixing the architectural identities too much.",
    "Each target object should follow its assigned reference clearly.",
  ]);
}

export function buildReferenceFilterSection(input: BuildStructuredPromptInput): string {
  const references = (input.references ?? []).filter((reference) => reference.imageLabel !== "Image A");
  if (references.length === 0) {
    return "";
  }

  return titleBlock("REFERENCE FILTER", [
    "Use only the relevant design language from the reference images.",
    "",
    "Ignore unrelated content from the reference images, including:",
    "",
    "people",
    "temporary items",
    "furniture not requested",
    "background clutter",
    "phone screenshot interface",
    "text overlays",
    "social media icons",
    "timestamps",
    "like / comment / follow UI",
    "any unrelated background distractions",
    "",
    "Avoid copying interface elements, text, or unrelated surroundings into the final result.",
  ]);
}

export function buildIntegrationRuleSection(): string {
  return titleBlock("INTEGRATION RULE", [
    "The edited result must integrate naturally into Image A.",
    "",
    "Make sure:",
    "",
    "the edited object stays in its exact intended location",
    "the scale is appropriate to the site",
    "the orientation fits the existing layout",
    "the perspective matches the original camera angle",
    "the edited area connects naturally to the ground, paving, lawn, water, wall, or surrounding surface",
    "shadows and lighting match the rest of the site",
    "materials and textures match the render quality of the original image",
    "the new edit feels designed into the site, not pasted in",
  ]);
}

export function buildMaterialAndRenderQualitySection(input: BuildStructuredPromptInput): string {
  const lines = [
    "Improve the realism and rendering quality of the edited area.",
    "",
    "Use:",
    "",
    "realistic material texture",
    "accurate scale and proportions",
    "natural lighting",
    "soft consistent shadows",
    "clear edges",
    "high-detail surfaces",
    "clean professional landscape visualization quality",
    "",
    "The final result should look like a professional architectural and landscape visualization.",
  ];

  if (input.intent === "architecture_replace") {
    lines.push("", "For architectural replacements, use detailed roof tiles, realistic timber or wall materials, believable openings, correct roof thickness, realistic columns, and natural connection to the ground.");
  }

  if (input.intent === "planting_design") {
    lines.push("", "For planting edits, use realistic plant scale, natural leaf density, clear species character, layered planting composition, and believable contact shadows.");
  }

  if (["koi_pond", "rockery_waterfall", "water_feature"].includes(input.intent)) {
    lines.push("", "For water feature edits, use realistic water reflections, natural pond edge details, wet stone texture, and believable water flow.");
  }

  return titleBlock("MATERIAL AND RENDER QUALITY", lines);
}

export function buildImportantLimitationsSection(input: BuildStructuredPromptInput): string {
  const lines = [
    "Avoid redesigning the garden.",
    "Avoid changing the camera angle or top-view composition.",
    "Avoid moving the pond, pavilion, bridge, rockery, driveway, gate, fences, paths, or major hardscape elements.",
    "Avoid changing unrelated buildings, planting areas, or landscape objects.",
    "Only edit the specified target area or target object.",
  ];

  if (input.intent === "architecture_replace") {
    lines.push(
      "Avoid turning an open pavilion into a closed modern house unless explicitly requested.",
      "Avoid turning a residential house into an open pavilion unless explicitly requested.",
      "Avoid mixing different reference styles into one confusing hybrid.",
    );
  }

  if (input.intent === "planting_design") {
    lines.push(
      "Avoid placing plants in unrelated areas.",
      "Avoid covering important architecture, fences, pond edges, paths, or focal objects.",
      "Avoid making the garden too dense or chaotic.",
    );
  }

  if (input.intent === "change_material") {
    lines.push(
      "Avoid applying the new material to unrelated surfaces.",
      "Avoid changing the shape or size of the target surface.",
    );
  }

  return titleBlock("IMPORTANT LIMITATIONS", lines);
}

export function buildAvoidSection(input: BuildStructuredPromptInput): string {
  const lines = [
    "Avoid:",
    "",
    "changing the camera angle",
    "changing the site layout",
    "moving the edited object to another position",
    "changing the courtyard size or shape",
    "changing the pond shape",
    "moving the pavilion or bridge",
    "redesigning the planting layout unless requested",
    "copying clutter or interface elements from references",
    "mixing multiple reference styles into a confusing hybrid",
    "unrealistic proportions",
    "blurry textures",
    "low-detail materials",
    "poor integration with the scene",
    "overgrown jungle density unless requested",
    "random decorative elements",
  ];

  if (input.intent === "architecture_replace") {
    lines.push(
      "distorted roof geometry",
      "incorrect roof direction",
      "floating structures",
      "unrealistic timber details",
      "flat low-detail roof surfaces",
    );
  }

  if (input.intent === "planting_design") {
    lines.push(
      "plants hiding the main subject",
      "plants placed inside the wrong boundary",
      "plants with unrealistic scale",
      "repeating clone-like trees",
    );
  }

  if (input.intent === "koi_pond") {
    lines.push(
      "turning lawn into water",
      "changing the pond outline",
      "covering the pond with too many plants",
    );
  }

  if (input.intent === "rockery_waterfall") {
    lines.push(
      "moving the rockery",
      "enlarging the rockery footprint",
      "blocking the waterfall",
      "creating plastic-looking rocks",
    );
  }

  if (input.intent === "change_material") {
    lines.push(
      "stretching the material texture",
      "misaligned tile pattern",
      "changing unrelated surfaces",
    );
  }

  return titleBlock("AVOID", lines);
}
