import type {
  AgentAnalysisStateContract,
  AgentClarificationContract,
  AgentConversationTurnContract,
  AgentProgressStage,
  AnalysisPlanContract,
  AnalysisProvenanceContract,
  AnalysisResultRowContract,
  ChartSpecContract,
  ConversationMessageContent,
  ResultColumnContract
} from "@agentic-csv/contracts";
import type {
  AgentRunStatus,
  ConversationProps,
  ConversationStatus
} from "@agentic-csv/domain";

export interface ConversationCursor {
  readonly lastActivityAt: Date;
  readonly id: string;
}

export interface ConversationPage {
  readonly conversations: readonly ConversationProps[];
  readonly nextCursor: ConversationCursor | null;
}

export interface ConversationMessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly sequence: number;
  readonly role: "user" | "assistant" | "system_event" | "tool";
  readonly status: "streaming" | "final" | "failed";
  readonly content: ConversationMessageContent;
  readonly createdAt: Date;
  readonly finalizedAt: Date | null;
}

export interface AgentRunView {
  readonly id: string;
  readonly conversationId: string;
  readonly userMessageId: string;
  readonly status: AgentRunStatus;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly progressStage: AgentProgressStage | null;
  readonly clarification: Pick<
    AgentClarificationContract,
    "id" | "question" | "options"
  > | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ConversationDetailView {
  readonly conversation: ConversationProps;
  readonly messages: readonly ConversationMessageView[];
  readonly activeRun: AgentRunView | null;
}

export interface CompletedAnalysis {
  readonly planId: string;
  readonly resultId: string;
  readonly chartArtifactId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly plan: AnalysisPlanContract;
  readonly planHash: string;
  readonly schema: readonly ResultColumnContract[];
  readonly rows: readonly AnalysisResultRowContract[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly executionMs: number;
  readonly checksum: string;
  readonly provenance: AnalysisProvenanceContract;
  readonly chartSpec: ChartSpecContract;
  readonly createdAt: Date;
}

export type RunEventType =
  | "run.queued"
  | "run.started"
  | "run.progress"
  | "run.clarification"
  | "run.resumed"
  | "assistant.delta"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export interface RunEventView {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly type: RunEventType;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RunEventPage {
  readonly events: readonly RunEventView[];
  readonly status: AgentRunStatus;
}

export interface ConversationSubmission {
  readonly messageId: string;
  readonly runId: string;
  readonly replayed: boolean;
}

export type ConversationDatasetAttachmentResult =
  | { readonly state: "attached"; readonly conversation: ConversationProps }
  | { readonly state: "conversation_not_found" }
  | { readonly state: "dataset_version_not_found" };

export interface ConversationRunWork {
  readonly userId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly userMessageId: string;
  readonly content: string;
  readonly conversationHistory: readonly AgentConversationTurnContract[];
  readonly selectedModel: string | null;
  readonly selectedReasoningEffort: string | null;
}

export interface ConversationRunMetrics {
  readonly stepCount: number;
  readonly repairCount: number;
  readonly toolCallCount: number;
}

export type ConversationResponderResult =
  | {
      readonly state: "completed";
      readonly text: string;
      readonly analysis?: CompletedAnalysis;
      readonly metrics?: ConversationRunMetrics;
    }
  | {
      readonly state: "waiting_for_user";
      readonly clarification: AgentClarificationContract;
      readonly checkpoint: AgentAnalysisStateContract;
      readonly metrics: ConversationRunMetrics;
    };

export interface ConversationRepository {
  create(conversation: ConversationProps): Promise<ConversationProps>;
  list(input: {
    readonly userId: string;
    readonly status: ConversationStatus;
    readonly cursor: ConversationCursor | null;
    readonly limit: number;
  }): Promise<ConversationPage>;
  getConversation(
    userId: string,
    conversationId: string
  ): Promise<ConversationProps | null>;
  getDetail(
    userId: string,
    conversationId: string
  ): Promise<ConversationDetailView | null>;
  save(input: {
    readonly conversation: ConversationProps;
    readonly expectedVersion: number;
  }): Promise<ConversationProps | null>;
  attachDatasetVersion(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly datasetVersionId: string | null;
    readonly occurredAt: Date;
  }): Promise<ConversationDatasetAttachmentResult>;
  delete(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<boolean>;
  enqueueMessage(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly messageId: string;
    readonly runId: string;
    readonly clientRequestId: string;
    readonly content: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<ConversationSubmission>;
  claimRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly occurredAt: Date;
  }): Promise<ConversationRunWork | null>;
  completeRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly assistantMessageId: string;
    readonly assistantText: string;
    readonly analysis?: CompletedAnalysis;
    readonly generatedTitle: string;
    readonly metrics?: ConversationRunMetrics;
    readonly occurredAt: Date;
  }): Promise<void>;
  pauseRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly clarification: AgentClarificationContract;
    readonly metrics: ConversationRunMetrics;
    readonly occurredAt: Date;
  }): Promise<void>;
  resumeRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly answerMessageId: string;
    readonly answer: string;
    readonly saveAsDatasetDefinition: boolean;
    readonly memoryId: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<AgentRunView | null>;
  recordRunProgress(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly stage: AgentProgressStage;
    readonly message: string;
    readonly stepCount: number;
    readonly repairCount: number;
    readonly toolCallCount: number;
    readonly occurredAt: Date;
  }): Promise<boolean>;
  isRunCancelled(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<boolean>;
  failRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly code: string;
    readonly message: string;
    readonly occurredAt: Date;
  }): Promise<void>;
  cancelRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly occurredAt: Date;
  }): Promise<AgentRunView | null>;
  listRunEvents(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly afterSequence: number;
    readonly limit: number;
  }): Promise<RunEventPage | null>;
}

export interface ConversationResponder {
  respond(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly userMessageId: string;
    readonly correlationId: string;
    readonly content: string;
    readonly conversationHistory: readonly AgentConversationTurnContract[];
    readonly selectedModel: string | null;
    readonly selectedReasoningEffort: string | null;
  }): Promise<ConversationResponderResult>;
}
