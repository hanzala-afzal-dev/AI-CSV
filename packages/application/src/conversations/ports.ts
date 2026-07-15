import type { ConversationMessageContent } from "@agentic-csv/contracts";
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ConversationDetailView {
  readonly conversation: ConversationProps;
  readonly messages: readonly ConversationMessageView[];
  readonly activeRun: AgentRunView | null;
}

export type RunEventType =
  | "run.queued"
  | "run.started"
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
}

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
  delete(userId: string, conversationId: string): Promise<boolean>;
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
    readonly generatedTitle: string;
    readonly occurredAt: Date;
  }): Promise<void>;
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
    readonly content: string;
  }): Promise<{ readonly text: string }>;
}
