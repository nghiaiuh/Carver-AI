import type {
  PromptEngineTrustedContext,
  PromptInterpreterMeta,
  PromptInterpreterResult,
  PromptWarning,
} from "@carver/shared";

export * from "@carver/shared";

export type PromptPlanBuildInput = {
  purpose: "enhance" | "generation";
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  interpretation: PromptInterpreterResult;
  degraded: boolean;
  warnings: PromptWarning[];
  interpreter: PromptInterpreterMeta;
};
