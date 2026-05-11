import type { CarverState } from "../state";

export const routeIntent = (state: CarverState): Partial<CarverState> => {
  const intent = state.intent ?? "chat";
  return { intent };
};
