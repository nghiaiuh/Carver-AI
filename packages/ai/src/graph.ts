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
