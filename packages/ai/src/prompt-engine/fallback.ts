import type { PromptEngineTrustedContext, PromptInterpreterResult, PromptWarning } from "@carver/shared";

const containsWord = (prompt: string, words: string[]) => words.some((word) => prompt.includes(word));

export const buildDegradedInterpreterResult = (params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  fallbackReason: string;
  warnings: PromptWarning[];
}): PromptInterpreterResult => {
  const normalizedPrompt = params.rawPrompt.toLowerCase().trim();
  params.warnings.push({
    code: "INTERPRETER_FALLBACK",
    message: params.fallbackReason,
  });

  if (!normalizedPrompt) {
    return {
      executionMode: params.trustedContext.executionMode,
      targetHint: params.trustedContext.target?.contextId ?? null,
      operations: [],
      references: [],
      preserveRequests: [],
      avoidRequests: [],
      notes: ["empty-raw-prompt"],
    };
  }

  if (containsWord(normalizedPrompt, ["remove", "xoa", "delete"])) {
    return {
      executionMode: params.trustedContext.executionMode,
      targetHint: params.trustedContext.target?.contextId ?? null,
      operations: params.trustedContext.target
        ? [
            {
              type: "remove_object",
              targetContextId: params.trustedContext.target.contextId,
            },
          ]
        : [],
      references: [],
      preserveRequests: [],
      avoidRequests: [],
      notes: ["fallback-remove"],
    };
  }

  if (containsWord(normalizedPrompt, ["replace", "thay"])) {
    return {
      executionMode: params.trustedContext.executionMode,
      targetHint: params.trustedContext.target?.contextId ?? null,
      operations: params.trustedContext.target
        ? [
            {
              type: "replace_object",
              targetContextId: params.trustedContext.target.contextId,
              replacementCategory: normalizedPrompt,
            },
          ]
        : [],
      references: [],
      preserveRequests: params.trustedContext.executionMode === "text_to_image" ? [] : ["Preserve camera and layout."],
      avoidRequests: [],
      notes: ["fallback-replace"],
    };
  }

  return {
    executionMode: params.trustedContext.executionMode,
    targetHint: params.trustedContext.target?.contextId ?? null,
    operations: [
      {
        type: "restyle",
        targetContextId: params.trustedContext.target?.contextId,
        style: normalizedPrompt,
      },
    ],
    references: [],
    preserveRequests: params.trustedContext.executionMode === "text_to_image" ? [] : ["Preserve camera and layout."],
    avoidRequests: [],
    notes: ["fallback-restyle"],
  };
};
