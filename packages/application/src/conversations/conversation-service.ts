import {
  Conversation,
  createUuidV7,
  type ConversationStatus,
  normalizeConversationTitle
} from "@agentic-csv/domain";
import { ConversationError } from "./conversation-error";
import type {
  AgentRunView,
  ConversationCursor,
  ConversationDetailView,
  ConversationPage,
  ConversationRepository,
  ConversationSubmission,
  RunEventPage
} from "./ports";

export class ConversationService {
  public constructor(
    private readonly repository: ConversationRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = createUuidV7
  ) {}

  public create(input: {
    readonly userId: string;
    readonly title?: string;
  }): Promise<ReturnType<Conversation["toPrimitives"]>> {
    return this.repository.create(
      Conversation.create({
        id: this.createId(),
        userId: input.userId,
        ...(input.title === undefined ? {} : { title: input.title }),
        now: this.now()
      }).toPrimitives()
    );
  }

  public list(input: {
    readonly userId: string;
    readonly status: ConversationStatus;
    readonly cursor: ConversationCursor | null;
    readonly limit: number;
  }): Promise<ConversationPage> {
    return this.repository.list(input);
  }

  public async getDetail(
    userId: string,
    conversationId: string
  ): Promise<ConversationDetailView> {
    const detail = await this.repository.getDetail(userId, conversationId);
    if (!detail) throw notFound();
    return detail;
  }

  public async rename(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly title: string;
  }) {
    const current = await this.requireConversation(input.userId, input.conversationId);
    const conversation = Conversation.rehydrate(current);
    const expectedVersion = current.version;
    conversation.rename(normalizeConversationTitle(input.title), this.now());
    if (conversation.toPrimitives().version === expectedVersion) return current;
    const saved = await this.repository.save({
      conversation: conversation.toPrimitives(),
      expectedVersion
    });
    if (!saved) throw conflict();
    return saved;
  }

  public async setArchived(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly archived: boolean;
  }) {
    const current = await this.requireConversation(input.userId, input.conversationId);
    const conversation = Conversation.rehydrate(current);
    const expectedVersion = current.version;
    conversation.setArchived(input.archived, this.now());
    if (conversation.toPrimitives().version === expectedVersion) return current;
    const saved = await this.repository.save({
      conversation: conversation.toPrimitives(),
      expectedVersion
    });
    if (!saved) throw conflict();
    return saved;
  }

  public async setActiveDataset(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly datasetVersionId: string | null;
  }) {
    const result = await this.repository.attachDatasetVersion({
      ...input,
      occurredAt: this.now()
    });
    if (result.state !== "attached") {
      if (result.state === "conversation_not_found") throw notFound();
      if (result.state === "dataset_version_not_found") {
        throw new ConversationError(
          "CONVERSATION_DATASET_NOT_FOUND",
          "Dataset version was not found."
        );
      }
    }
    return result.conversation;
  }

  public async delete(userId: string, conversationId: string): Promise<void> {
    if (!(await this.repository.delete(userId, conversationId))) throw notFound();
  }

  public submitMessage(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly clientRequestId: string;
    readonly content: string;
    readonly correlationId: string;
  }): Promise<ConversationSubmission> {
    return this.repository.enqueueMessage({
      ...input,
      messageId: this.createId(),
      runId: this.createId(),
      content: normalizeMessage(input.content),
      occurredAt: this.now()
    });
  }

  public async cancelRun(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<AgentRunView> {
    const run = await this.repository.cancelRun({ ...input, occurredAt: this.now() });
    if (!run) throw new ConversationError("CONVERSATION_RUN_NOT_FOUND", "Run not found.");
    return run;
  }

  public async listRunEvents(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly afterSequence: number;
    readonly limit?: number;
  }): Promise<RunEventPage> {
    const page = await this.repository.listRunEvents({
      ...input,
      limit: input.limit ?? 100
    });
    if (!page) {
      throw new ConversationError("CONVERSATION_RUN_NOT_FOUND", "Run not found.");
    }
    return page;
  }

  private async requireConversation(userId: string, conversationId: string) {
    const conversation = await this.repository.getConversation(userId, conversationId);
    if (!conversation) throw notFound();
    return conversation;
  }
}

function normalizeMessage(content: string): string {
  return content.normalize("NFKC").trim();
}

function notFound(): ConversationError {
  return new ConversationError("CONVERSATION_NOT_FOUND", "Conversation not found.");
}

function conflict(): ConversationError {
  return new ConversationError(
    "CONVERSATION_CONFLICT",
    "The conversation changed. Refresh and try again."
  );
}
