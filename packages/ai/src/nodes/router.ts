import type { CarverState } from "../state";

const classifyPrompt = (prompt: string | undefined): CarverState["intent"] => {
  const normalizedPrompt = prompt?.toLowerCase() ?? "";

  if (
    normalizedPrompt.includes("upload") ||
    normalizedPrompt.includes("reference") ||
    normalizedPrompt.includes("analyze")
  ) {
    return "analyze_reference";
  }

  if (
    normalizedPrompt.includes("change") ||
    normalizedPrompt.includes("refine") ||
    normalizedPrompt.includes("revise") ||
    normalizedPrompt.includes("edit")
  ) {
    return "refine";
  }

  if (
    normalizedPrompt.includes("generate") ||
    normalizedPrompt.includes("create") ||
    normalizedPrompt.includes("render") ||
    normalizedPrompt.includes("concept")
  ) {
    return "generate";
  }

  return "chat";
};

export const routeIntent = (state: CarverState): Partial<CarverState> => {
  const intent = state.intent === "chat" ? classifyPrompt(state.prompt) : state.intent;
  return { intent };
};
