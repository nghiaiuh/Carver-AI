import {
  buildAvoidSection,
  buildImageUsageSection,
  buildImportantLimitationsSection,
  buildIntegrationRuleSection,
  buildMainGoalSection,
  buildMaterialAndRenderQualitySection,
  buildPreserveExactlySection,
  buildReferenceFilterSection,
  buildReferencePrioritySection,
  buildStrictEditingRuleSection,
  buildTargetEditSection,
} from "./promptSections";
import type { BuildStructuredPromptInput, StructuredPromptResult } from "./types";

type NamedSection = {
  name: string;
  value: string;
};

function normalizeInput(input: BuildStructuredPromptInput): BuildStructuredPromptInput {
  return {
    ...input,
    mode: input.mode ?? "image_editing",
    targetObjects: input.targetObjects ?? [],
    targetAreas: input.targetAreas ?? [],
    replacementObjects: input.replacementObjects ?? [],
    materials: input.materials ?? [],
    plants: input.plants ?? [],
    styles: input.styles ?? [],
    references: input.references ?? [],
    projectContext: input.projectContext ?? {},
  };
}

export function buildStructuredEditingPrompt(input: BuildStructuredPromptInput): StructuredPromptResult {
  const normalizedInput = normalizeInput(input);
  const sections: NamedSection[] = [
    { name: "Use Image A as the direct edit target.", value: buildImageUsageSection(normalizedInput) },
    { name: "MAIN GOAL", value: buildMainGoalSection(normalizedInput) },
    { name: "STRICT EDITING RULE", value: buildStrictEditingRuleSection(normalizedInput) },
    { name: "PRESERVE EXACTLY", value: buildPreserveExactlySection(normalizedInput) },
    { name: "TARGET EDIT REQUIREMENT", value: buildTargetEditSection(normalizedInput) },
    { name: "REFERENCE PRIORITY", value: buildReferencePrioritySection(normalizedInput) },
    { name: "REFERENCE FILTER", value: buildReferenceFilterSection(normalizedInput) },
    { name: "INTEGRATION RULE", value: buildIntegrationRuleSection() },
    { name: "MATERIAL AND RENDER QUALITY", value: buildMaterialAndRenderQualitySection(normalizedInput) },
    { name: "IMPORTANT LIMITATIONS", value: buildImportantLimitationsSection(normalizedInput) },
    { name: "AVOID", value: buildAvoidSection(normalizedInput) },
  ];

  const populatedSections = sections.filter((section) => section.value.trim().length > 0);

  return {
    prompt: populatedSections.map((section) => section.value.trim()).join("\n\n"),
    promptFormat: "structured_editing_prompt_v1",
    sections: populatedSections.map((section) => section.name),
  };
}
