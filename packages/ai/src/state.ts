import { Annotation } from "@langchain/langgraph";

export type CarverIntent =
  | "chat"
  | "generate"
  | "refine"
  | "analyze_reference";

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
