import type { CarverImageExecutionMode, CreateAiJobRequest } from "@carver/shared";

type ChatGenerationIntent = {
  shouldGenerate: boolean;
  executionMode: CarverImageExecutionMode;
  jobType: CreateAiJobRequest["jobType"];
};

const GENERATION_PATTERNS = [
  /\bgenerate\b/,
  /\bcreate\b/,
  /\brender\b/,
  /\bvisuali[sz]e\b/,
  /\bmake\b.+\bimage\b/,
  /\bedit\b/,
  /\brefine\b/,
  /\breplace\b/,
  /\bremove\b/,
  /\btransform\b/,
  /\brestyle\b/,
  /\bretouch\b/,
  /\bhay tao\b/,
  /\btao anh\b/,
  /\btao concept\b/,
  /\bsinh anh\b/,
  /\bgen anh\b/,
  /\bchinh anh\b/,
  /\bchinh sua\b/,
  /\bdoi\b.+\banh\b/,
  /\bthay doi\b/,
  /\blam moi\b/,
  /\blam anh\b/,
  /\bve lai\b/,
  /\bdung anh nay\b/,
];

const ANALYSIS_PATTERNS = [
  /\bdescribe\b/,
  /\bexplain\b/,
  /\banaly[sz]e\b/,
  /\breview\b/,
  /\bwhat do you see\b/,
  /\bmo ta\b/,
  /\bgiai thich\b/,
  /\bphan tich\b/,
  /\bnhan xet\b/,
  /\btu van\b/,
];

function normalizePrompt(prompt: string) {
  return prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectChatGenerationIntent(params: {
  prompt: string;
  hasTargetImage: boolean;
  attachmentCount: number;
  referenceImageCount: number;
}) : ChatGenerationIntent {
  const normalizedPrompt = normalizePrompt(params.prompt);
  const hasGenerationVerb = GENERATION_PATTERNS.some((pattern) => pattern.test(normalizedPrompt));
  const hasAnalysisVerb = ANALYSIS_PATTERNS.some((pattern) => pattern.test(normalizedPrompt));

  if (!hasGenerationVerb || (hasAnalysisVerb && !params.hasTargetImage && params.attachmentCount === 0)) {
    return {
      shouldGenerate: false,
      executionMode: "text_to_image",
      jobType: "generate_concept",
    };
  }

  const hasEditableImageContext =
    params.hasTargetImage || params.attachmentCount > 0 || params.referenceImageCount > 0;

  return {
    shouldGenerate: true,
    executionMode: hasEditableImageContext ? "image_edit" : "text_to_image",
    jobType: hasEditableImageContext ? "refine_concept" : "generate_concept",
  };
}
