import { Annotation } from "@langchain/langgraph";
import type {
  AgentAnalysisStateContract,
  AgentExplanationContract,
  AgentPlanningDecisionDraftContract
} from "@agentic-csv/contracts";
import type { CompletedAnalysis } from "@agentic-csv/application";

export interface AnalysisRuntimeState {
  readonly snapshot: AgentAnalysisStateContract;
  readonly decision: AgentPlanningDecisionDraftContract | null;
  readonly analysis: CompletedAnalysis | null;
  readonly explanation: AgentExplanationContract | null;
  readonly finalText: string | null;
  readonly outcome: "continue" | "waiting_for_user" | "unsupported" | "completed";
}

export const AnalysisStateAnnotation = Annotation.Root({
  value: Annotation<AnalysisRuntimeState>({
    reducer: (_current, update) => update
  })
});

export type AnalysisState = AgentAnalysisStateContract;
