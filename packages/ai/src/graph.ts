/*
 * Flow: Defines AI graph state and routing.
 * 1. Receive prompt/session state.
 * 2. Classify or transform the AI workflow state.
 * 3. Return state for downstream graph nodes.
 */

import { END, START, StateGraph } from "@langchain/langgraph";
import { CarverStateAnnotation } from "./state";
import { routeIntent } from "./nodes/router";

export const buildGraph = () => {
  const graph = new StateGraph(CarverStateAnnotation)
    .addNode("router", routeIntent)
    .addEdge(START, "router")
    .addEdge("router", END);

  return graph.compile();
};
