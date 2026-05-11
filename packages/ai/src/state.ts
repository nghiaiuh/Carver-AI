import { Annotation } from "@langchain/langgraph";

export type CarverIntent = "chat" | "edit" | "generate" | "annotate";

export const CarverStateAnnotation = Annotation.Root({
  intent: Annotation<CarverIntent>({
    reducer: (_, next) => next,
    default: () => "chat",
  }),
  prompt: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type CarverState = typeof CarverStateAnnotation.State;

export const createInitialState = (): CarverState => ({
  intent: "chat",
  prompt: undefined,
});
