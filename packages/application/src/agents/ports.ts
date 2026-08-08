import type {
  AgentAnalysisStateContract,
  AgentClarificationContract,
  AgentExplanationContract,
  AgentPlanningDecisionDraftContract,
  AnalysisPlanContract,
  AnalysisResultRowContract,
  ResultColumnContract
} from "@agentic-csv/contracts";
import type { ReasoningEffort } from "@agentic-csv/domain";
import type { SecretValue } from "../providers/secret-value";

export interface AgentCheckpointRecord {
  readonly state: AgentAnalysisStateContract;
  readonly revision: number;
}

export interface AgentCheckpointRepository {
  load(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<AgentCheckpointRecord | null>;
  save(input: {
    readonly state: AgentAnalysisStateContract;
    readonly expectedRevision: number | null;
  }): Promise<AgentCheckpointRecord>;
}

export interface AgentPlanModelInput {
  readonly question: string;
  readonly columns: AgentAnalysisStateContract["columns"];
  readonly clarification: AgentClarificationContract | null;
  readonly validationErrors: readonly string[];
}

export interface AgentExplanationModelInput {
  readonly question: string;
  readonly plan: AnalysisPlanContract;
  readonly schema: readonly ResultColumnContract[];
  readonly rows: readonly AnalysisResultRowContract[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
}

export interface AgentModelGateway {
  createPlan(input: {
    readonly secret: SecretValue;
    readonly modelId: string;
    readonly reasoningEffort: ReasoningEffort;
    readonly request: AgentPlanModelInput;
  }): Promise<AgentPlanningDecisionDraftContract>;
  createExplanation(input: {
    readonly secret: SecretValue;
    readonly modelId: string;
    readonly reasoningEffort: ReasoningEffort;
    readonly request: AgentExplanationModelInput;
  }): Promise<AgentExplanationContract>;
}

export interface AgentModelSession {
  readonly modelId: string;
  readonly reasoningEffort: ReasoningEffort;
  createPlan(input: AgentPlanModelInput): Promise<AgentPlanningDecisionDraftContract>;
  createExplanation(input: AgentExplanationModelInput): Promise<AgentExplanationContract>;
}
