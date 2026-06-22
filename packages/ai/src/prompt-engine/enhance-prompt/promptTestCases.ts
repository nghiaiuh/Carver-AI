import type { BuildStructuredPromptInput } from "./types";

export const structuredPromptTestCases: Array<{
  name: string;
  input: BuildStructuredPromptInput;
  expectedSections: string[];
}> = [
  {
    name: "Add bamboo outside wooden fence",
    input: {
      originalPrompt: "them truc quan tu ngoai hang rao go",
      mode: "image_editing",
      intent: "planting_design",
      targetObjects: ["slender bamboo"],
      targetAreas: ["outside the wooden fence"],
      plants: ["slender bamboo"],
    },
    expectedSections: [
      "Use Image A as the direct edit target.",
      "MAIN GOAL",
      "STRICT EDITING RULE",
      "PRESERVE EXACTLY",
      "TARGET EDIT REQUIREMENT",
      "INTEGRATION RULE",
      "MATERIAL AND RENDER QUALITY",
      "IMPORTANT LIMITATIONS",
      "AVOID",
    ],
  },
  {
    name: "Change courtyard material",
    input: {
      originalPrompt: "doi san thanh gach xam ke caro",
      mode: "image_editing",
      intent: "change_material",
      targetObjects: ["courtyard"],
      materials: ["gray square grid paving tiles"],
    },
    expectedSections: [
      "TARGET EDIT REQUIREMENT",
      "IMPORTANT LIMITATIONS",
    ],
  },
  {
    name: "Replace two architecture references",
    input: {
      originalPrompt: "thay nha mep trai bang anh 2, thay nha gan giua ben duoi bang anh 3",
      mode: "image_editing",
      intent: "architecture_replace",
      targetObjects: ["house / structure", "house / structure"],
      targetAreas: ["left edge", "near the lower middle area"],
      references: [
        {
          imageLabel: "Image A",
          role: "direct_edit_target",
        },
        {
          imageLabel: "Image B",
          role: "architectural_reference",
          targetArea: "left edge",
          targetObject: "house / structure",
        },
        {
          imageLabel: "Image C",
          role: "architectural_reference",
          targetArea: "near the lower middle area",
          targetObject: "house / structure",
        },
      ],
    },
    expectedSections: [
      "TARGET EDIT REQUIREMENT",
      "REFERENCE PRIORITY",
      "REFERENCE FILTER",
    ],
  },
];

/*
import { buildStructuredEditingPrompt } from "./structuredPromptBuilder";

const result = buildStructuredEditingPrompt({
  originalPrompt: "thay nha mep trai bang anh 2, thay nha gan giua ben duoi bang anh 3",
  mode: "image_editing",
  intent: "architecture_replace",
  targetAreas: ["left edge", "near the lower middle area"],
  targetObjects: ["house / structure", "house / structure"],
  references: [
    { imageLabel: "Image A", role: "direct_edit_target" },
    {
      imageLabel: "Image B",
      role: "architectural_reference",
      targetArea: "left edge",
      targetObject: "house / structure",
    },
    {
      imageLabel: "Image C",
      role: "architectural_reference",
      targetArea: "near the lower middle area",
      targetObject: "house / structure",
    },
  ],
});

console.log(result.prompt);
*/
