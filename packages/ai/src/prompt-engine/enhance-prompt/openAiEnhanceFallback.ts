import type { EnhanceMode, EnhanceProjectContext } from "./enhanceTypes";
import { createOpenAITextResponse } from "../../server/openaiChat";

const FALLBACK_SYSTEM_PROMPT = `You are CarverAI Prompt Enhancer, an expert landscape design prompt engineer.

Use the user's original request together with the provided rule-based scaffold to produce a polished CarverAI prompt.

Rules:
- Preserve the user's original intent.
- Keep the user's requested object, position, area, and action as the central instruction.
- Do not replace the request with a different landscape task.
- Use the rule-based scaffold only as support and structure, not as a substitute for the user's meaning.
- Avoid inventing unrelated features.
- Add useful landscape design details only when they naturally match the request.
- Keep preservation rules and avoid-rules when appropriate for image editing.
- Avoid overgrown jungle density unless requested.
- Keep the result concise but detailed.
- Output only the enhanced prompt text.`;

export async function enhancePromptWithOpenAI(params: {
  prompt: string;
  ruleScaffold: string;
  mode: EnhanceMode;
  projectContext?: EnhanceProjectContext;
}) {
  const projectContext = params.projectContext ?? {};

  return createOpenAITextResponse({
    model: "gpt-5-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: FALLBACK_SYSTEM_PROMPT,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Original user prompt:
${params.prompt}

Rule-based scaffold:
${params.ruleScaffold}

Detected mode:
${params.mode}

Detected project context:
${JSON.stringify(projectContext)}

Rewrite it into a professional CarverAI landscape prompt that stays faithful to the original user request while benefiting from the scaffold.`,
          },
        ],
      },
    ],
  });
}
