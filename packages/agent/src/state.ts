import { Annotation } from "@langchain/langgraph";
import type { AgentAnalysisStateContract } from "@agentic-csv/contracts";

export const AnalysisStateAnnotation = Annotation.Root({
  correlationId: Annotation<string>(),
  userId: Annotation<string>(),
  datasetId: Annotation<string>(),
  datasetVersion: Annotation<number | undefined>(),
  question: Annotation<string>(),
  retrievedContext: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  plannedSteps: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => []
  })
});

export type AnalysisState = AgentAnalysisStateContract;
