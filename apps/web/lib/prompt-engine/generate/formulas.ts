/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import type { EditBrief, EditScope, LandscapeTaskType } from "./types";
import { buildEditBrief } from "./buildEditBrief";

type FormulaInput = {
  rawPrompt: string;
  taskType: LandscapeTaskType;
  editScope: EditScope;
  targetArea?: string;
  targetObject?: string;
  preserveRules: string[];
  negativeConstraints: string[];
  stylePreset: string;
};

type FormulaResult = {
  formulaUsed: string;
  enhancedPrompt: string;
  editBrief: EditBrief;
};

const qualityRequirements = [
  "High realism",
  "natural integration",
  "consistent lighting",
  "sharp details",
  "correct scale",
  "coherent shadows",
  "professional landscape visualization quality",
];

const sentenceList = (items: string[]) => items.join(", ") + ".";

function detailsForTask(input: FormulaInput) {
  switch (input.taskType) {
    case "planting_design":
      return {
        formulaUsed: "planting_design_formula",
        designRequirements:
          "Add refined layered planting with fern clusters, spider plants, low ornamental grasses, creeping philodendron, compact bonsai shrubs, podocarpus / tùng la hán, areca palm clusters, and slender bamboo / trúc quân tử where suitable. Keep the composition breathable, intentional, elegant, and not overgrown.",
        palette: "Refined tropical Vietnamese–Korean–Chinese planting, natural stones, controlled groundcover, soft green texture, clean edges.",
      };
    case "rockery_replacement":
      return {
        formulaUsed: "rockery_replacement_formula",
        designRequirements:
          "Only replace the rockery waterfall. Preserve the pond and surrounding layout. Use natural limestone rock texture, layered vertical stone forms, moss and fern in crevices, visible water channels, and water flowing naturally into the pond.",
        palette: "Natural limestone, aged rock faces, moss, small fern pockets, realistic flowing water, refined waterfall composition.",
      };
    case "house_replacement":
      return {
        formulaUsed: "house_replacement_formula",
        designRequirements:
          "Only replace the target house. Preserve the exact footprint and position. Match reference architecture if provided, including roof form, number of roof layers, columns, railings, steps, material, and orientation. Do not affect surrounding garden or hardscape.",
        palette: "Architectural materials matching the requested style/reference, realistic roof, columns, railings, steps, and facade details.",
      };
    case "courtyard_paving":
      return {
        formulaUsed: "courtyard_paving_formula",
        designRequirements:
          "Only change the courtyard paving material. Preserve the courtyard shape and all surrounding objects. If the raw prompt mentions gray grid tiles, use gray square grid tiles with clean joints and realistic scale.",
        palette: "Premium gray square tiles, neat grid layout, realistic paving material, subtle surface texture, clean courtyard finish.",
      };
    case "koi_pond_edge_design":
      return {
        formulaUsed: "koi_pond_edge_formula",
        designRequirements:
          "Only redesign the pond edge. Preserve the pond shape and water area. Use natural cổ thạch limestone rocks, irregular refined placement, partially embedded stones, small ferns, and spider plants between stones.",
        palette: "Natural cổ thạch limestone, refined irregular stone placement, small ferns, spider plants, clean pond-edge planting.",
      };
    default:
      return {
        formulaUsed: "base_formula",
        designRequirements:
          "Apply the user request with precise, realistic landscape design details while keeping the edit limited to the requested target.",
        palette: `${input.stylePreset} Use suitable plants, stones, paving, water, lighting, or architectural details based on the requested edit.`,
      };
  }
}

export function buildEnhancedPrompt(input: FormulaInput): FormulaResult {
  const details = detailsForTask(input);
  const target = input.targetArea ?? input.targetObject ?? "The exact target area or object requested by the user.";
  const modify = [input.rawPrompt, details.designRequirements];

  const enhancedPrompt = [
    "DIRECT EDIT TARGET",
    "Use the uploaded image as the direct edit target.",
    "",
    "MAIN GOAL",
    `Rewrite and execute the user's requested change clearly and specifically: ${input.rawPrompt}`,
    "",
    "STRICT EDITING RULE",
    input.editScope === "full_redesign"
      ? "Redesign the requested full site while preserving the original camera and site boundaries."
      : "Only modify the requested target area/object. Do not redesign the whole image.",
    "",
    "PRESERVE EXACTLY",
    sentenceList(input.preserveRules),
    "",
    "TARGET AREA",
    target,
    "",
    "DESIGN REQUIREMENTS",
    details.designRequirements,
    "",
    "MATERIAL / PLANTING PALETTE",
    details.palette,
    "",
    "NEGATIVE CONSTRAINTS",
    input.negativeConstraints.join(" "),
    "",
    "QUALITY REQUIREMENTS",
    sentenceList(qualityRequirements),
  ].join("\n");

  return {
    formulaUsed: details.formulaUsed,
    enhancedPrompt,
    editBrief: buildEditBrief({
      taskType: input.taskType,
      editScope: input.editScope,
      targetArea: input.targetArea,
      targetObject: input.targetObject,
      preserve: input.preserveRules,
      modify,
      avoid: input.negativeConstraints,
      quality: qualityRequirements,
    }),
  };
}
