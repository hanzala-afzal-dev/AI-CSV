import { END, START, StateGraph } from "@langchain/langgraph";
import { AnalysisStateAnnotation } from "./state";

async function loadDatasetContextNode() {
  return {
    retrievedContext: [
      "Dataset context loading is deferred to the CSV upload and profiling specifications."
    ]
  };
}

async function planAnalysisNode() {
  return {
    plannedSteps: [
      "Complete analysis planning is deferred. Future plans must use deterministic tools for calculations."
    ]
  };
}

export function createAnalysisGraph() {
  return new StateGraph(AnalysisStateAnnotation)
    .addNode("load_dataset_context", loadDatasetContextNode)
    .addNode("plan_analysis", planAnalysisNode)
    .addEdge(START, "load_dataset_context")
    .addEdge("load_dataset_context", "plan_analysis")
    .addEdge("plan_analysis", END)
    .compile();
}
