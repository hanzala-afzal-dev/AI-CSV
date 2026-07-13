import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  ConversationError,
  type AgentRunView,
  type ConversationDetailView,
  type ConversationMessageView,
  type ConversationPage,
  type ConversationRepository,
  type ConversationRunWork,
  type ConversationSubmission,
  type RunEventPage,
  type RunEventType,
  type RunEventView
} from "@agentic-csv/application";
import { conversationMessageContentSchema } from "@agentic-csv/contracts";
import {
  activeAgentRunStatuses,
  Conversation,
  type ConversationProps
} from "@agentic-csv/domain";
import {
  agentRuns,
  conversationMessages,
  conversations,
  outboxEvents,
  providerPreferences,
  runEvents
} from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof conversationMessages.$inferSelect;
type RunRow = typeof agentRuns.$inferSelect;
type EventRow = typeof runEvents.$inferSelect;

export class PostgresConversationRepository implements ConversationRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public create(conversation: ConversationProps): Promise<ConversationProps> {
    return this.executeForUser(conversation.userId, async (transaction) => {
      const [created] = await transaction
        .insert(conversations)
        .values(conversation)
        .returning();
      if (!created) throw new Error("Conversation insert did not return a row.");
      return mapConversation(created);
    });
  }

  public list(
    input: Parameters<ConversationRepository["list"]>[0]
  ): Promise<ConversationPage> {
    return this.executeForUser(input.userId, async (transaction) => {
      const cursorCondition = input.cursor
        ? or(
            lt(conversations.lastActivityAt, input.cursor.lastActivityAt),
            and(
              eq(conversations.lastActivityAt, input.cursor.lastActivityAt),
              lt(conversations.id, input.cursor.id)
            )
          )
        : undefined;
      const rows = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, input.userId),
            eq(conversations.status, input.status),
            cursorCondition
          )
        )
        .orderBy(desc(conversations.lastActivityAt), desc(conversations.id))
        .limit(input.limit + 1);
      const hasNext = rows.length > input.limit;
      const visible = hasNext ? rows.slice(0, input.limit) : rows;
      const last = visible.at(-1);
      return {
        conversations: visible.map(mapConversation),
        nextCursor:
          hasNext && last ? { lastActivityAt: last.lastActivityAt, id: last.id } : null
      };
    });
  }

  public getConversation(
    userId: string,
    conversationId: string
  ): Promise<ConversationProps | null> {
    return this.executeForUser(userId, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.userId, userId), eq(conversations.id, conversationId))
        )
        .limit(1);
      return row ? mapConversation(row) : null;
    });
  }

  public getDetail(
    userId: string,
    conversationId: string
  ): Promise<ConversationDetailView | null> {
    return this.executeForUser(userId, async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.userId, userId), eq(conversations.id, conversationId))
        )
        .limit(1);
      if (!conversation) return null;
      const messages = await transaction
        .select()
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.userId, userId),
            eq(conversationMessages.conversationId, conversationId)
          )
        )
        .orderBy(asc(conversationMessages.sequence));
      const activeRuns = await transaction
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.userId, userId),
            eq(agentRuns.conversationId, conversationId),
            inArray(agentRuns.status, [...activeAgentRunStatuses])
          )
        )
        .orderBy(desc(agentRuns.createdAt))
        .limit(1);
      return {
        conversation: mapConversation(conversation),
        messages: messages.map(mapMessage),
        activeRun: activeRuns[0] ? mapRun(activeRuns[0]) : null
      };
    });
  }

  public save(
    input: Parameters<ConversationRepository["save"]>[0]
  ): Promise<ConversationProps | null> {
    return this.executeForUser(input.conversation.userId, async (transaction) => {
      const [saved] = await transaction
        .update(conversations)
        .set({
          title: input.conversation.title,
          status: input.conversation.status,
          version: input.conversation.version,
          updatedAt: input.conversation.updatedAt
        })
        .where(
          and(
            eq(conversations.userId, input.conversation.userId),
            eq(conversations.id, input.conversation.id),
            eq(conversations.version, input.expectedVersion)
          )
        )
        .returning();
      return saved ? mapConversation(saved) : null;
    });
  }

  public delete(userId: string, conversationId: string): Promise<boolean> {
    return this.executeForUser(userId, async (transaction) => {
      const deleted = await transaction
        .delete(conversations)
        .where(
          and(eq(conversations.userId, userId), eq(conversations.id, conversationId))
        )
        .returning({ id: conversations.id });
      return deleted.length > 0;
    });
  }

  public async enqueueMessage(
    input: Parameters<ConversationRepository["enqueueMessage"]>[0]
  ): Promise<ConversationSubmission> {
    try {
      return await this.executeForUser(input.userId, async (transaction) => {
        const replay = await findExistingSubmission(transaction, input);
        if (replay) return replay;

        const [conversation] = await transaction
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.userId, input.userId),
              eq(conversations.id, input.conversationId)
            )
          )
          .limit(1)
          .for("update");
        if (!conversation) throw conversationNotFound();
        if (conversation.status === "archived") {
          throw new ConversationError(
            "CONVERSATION_ARCHIVED",
            "Unarchive this conversation before sending a message."
          );
        }

        const active = await transaction
          .select({ id: agentRuns.id })
          .from(agentRuns)
          .where(
            and(
              eq(agentRuns.userId, input.userId),
              eq(agentRuns.conversationId, input.conversationId),
              inArray(agentRuns.status, [...activeAgentRunStatuses])
            )
          )
          .limit(1);
        if (active.length > 0) throw runActive();

        const sequence = conversation.lastMessageSequence + 1;
        await transaction.insert(conversationMessages).values({
          id: input.messageId,
          userId: input.userId,
          conversationId: input.conversationId,
          sequence,
          role: "user",
          status: "final",
          contentParts: textContent(input.content),
          createdAt: input.occurredAt,
          finalizedAt: input.occurredAt
        });

        const [preference] = await transaction
          .select({
            modelId: providerPreferences.modelId,
            reasoningEffort: providerPreferences.reasoningEffort
          })
          .from(providerPreferences)
          .where(
            and(
              eq(providerPreferences.userId, input.userId),
              eq(providerPreferences.provider, "openai")
            )
          )
          .limit(1);
        await transaction.insert(agentRuns).values({
          id: input.runId,
          userId: input.userId,
          conversationId: input.conversationId,
          userMessageId: input.messageId,
          status: "queued",
          clientRequestId: input.clientRequestId,
          selectedModel: preference?.modelId ?? null,
          selectedReasoningEffort: preference?.reasoningEffort ?? null,
          createdAt: input.occurredAt,
          updatedAt: input.occurredAt
        });
        await transaction.insert(runEvents).values({
          runId: input.runId,
          userId: input.userId,
          conversationId: input.conversationId,
          sequence: 1,
          eventType: "run.queued",
          payload: { version: 1 },
          occurredAt: input.occurredAt
        });
        await transaction.insert(outboxEvents).values({
          userId: input.userId,
          aggregateId: input.runId,
          eventName: "queue.agent.run.v1",
          payload: {
            version: 1,
            jobName: "agent.run.v1",
            correlationId: input.correlationId,
            userId: input.userId,
            idempotencyKey: input.clientRequestId,
            conversationId: input.conversationId,
            runId: input.runId
          },
          occurredAt: input.occurredAt
        });
        await transaction
          .update(conversations)
          .set({
            lastMessageSequence: sequence,
            lastActivityAt: input.occurredAt,
            version: conversation.version + 1,
            updatedAt: input.occurredAt
          })
          .where(
            and(
              eq(conversations.userId, input.userId),
              eq(conversations.id, input.conversationId)
            )
          );
        return { messageId: input.messageId, runId: input.runId, replayed: false };
      });
    } catch (error) {
      const constraint = postgresConstraint(error);
      if (constraint === "agent_runs_one_active_per_conversation_unique") {
        throw runActive();
      }
      if (constraint === "agent_runs_user_client_request_unique") {
        const replay = await this.executeForUser(input.userId, (transaction) =>
          findExistingSubmission(transaction, input)
        );
        if (replay) return replay;
        throw requestIdReused();
      }
      throw error;
    }
  }

  public claimRun(
    input: Parameters<ConversationRepository["claimRun"]>[0]
  ): Promise<ConversationRunWork | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await transaction
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.userId, input.userId),
            eq(agentRuns.conversationId, input.conversationId),
            eq(agentRuns.id, input.runId)
          )
        )
        .limit(1)
        .for("update");
      if (!run || run.status !== "queued") return null;
      const sequence = await nextRunEventSequence(transaction, run.id);
      await transaction
        .update(agentRuns)
        .set({
          status: "running",
          startedAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .where(eq(agentRuns.id, run.id));
      await insertRunEvent(transaction, {
        run,
        sequence,
        eventType: "run.started",
        payload: { version: 1 },
        occurredAt: input.occurredAt
      });
      const [message] = await transaction
        .select()
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.userId, input.userId),
            eq(conversationMessages.conversationId, input.conversationId),
            eq(conversationMessages.id, run.userMessageId)
          )
        )
        .limit(1);
      if (!message) throw new Error("Run user message is missing.");
      return {
        userId: input.userId,
        conversationId: input.conversationId,
        runId: input.runId,
        userMessageId: run.userMessageId,
        content: extractText(message.contentParts)
      };
    });
  }

  public completeRun(
    input: Parameters<ConversationRepository["completeRun"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await lockRun(transaction, input);
      if (!run || !["running", "waiting_for_user"].includes(run.status)) return;
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, input.userId),
            eq(conversations.id, input.conversationId)
          )
        )
        .limit(1)
        .for("update");
      if (!conversation) return;
      const messageSequence = conversation.lastMessageSequence + 1;
      const eventSequence = await nextRunEventSequence(transaction, run.id);
      await transaction.insert(conversationMessages).values({
        id: input.assistantMessageId,
        userId: input.userId,
        conversationId: input.conversationId,
        sequence: messageSequence,
        role: "assistant",
        status: "final",
        contentParts: textContent(input.assistantText),
        createdAt: input.occurredAt,
        finalizedAt: input.occurredAt
      });
      await transaction
        .update(agentRuns)
        .set({
          status: "completed",
          completedAt: input.occurredAt,
          failureCode: null,
          failureMessage: null,
          updatedAt: input.occurredAt
        })
        .where(eq(agentRuns.id, run.id));
      await insertRunEvent(transaction, {
        run,
        sequence: eventSequence,
        eventType: "assistant.delta",
        payload: { version: 1, text: input.assistantText },
        occurredAt: input.occurredAt
      });
      await insertRunEvent(transaction, {
        run,
        sequence: eventSequence + 1,
        eventType: "run.completed",
        payload: { version: 1, messageId: input.assistantMessageId },
        occurredAt: input.occurredAt
      });
      await transaction
        .update(conversations)
        .set({
          title:
            conversation.title === Conversation.defaultTitle
              ? input.generatedTitle
              : conversation.title,
          lastMessageSequence: messageSequence,
          lastActivityAt: input.occurredAt,
          version: conversation.version + 1,
          updatedAt: input.occurredAt
        })
        .where(eq(conversations.id, conversation.id));
    });
  }

  public failRun(input: Parameters<ConversationRepository["failRun"]>[0]): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await lockRun(transaction, input);
      if (!run || ["completed", "failed", "cancelled"].includes(run.status)) return;
      const sequence = await nextRunEventSequence(transaction, run.id);
      await transaction
        .update(agentRuns)
        .set({
          status: "failed",
          failureCode: input.code,
          failureMessage: input.message,
          completedAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .where(eq(agentRuns.id, run.id));
      await insertRunEvent(transaction, {
        run,
        sequence,
        eventType: "run.failed",
        payload: { version: 1, code: input.code, message: input.message },
        occurredAt: input.occurredAt
      });
    });
  }

  public cancelRun(
    input: Parameters<ConversationRepository["cancelRun"]>[0]
  ): Promise<AgentRunView | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await lockRun(transaction, input);
      if (!run) return null;
      if (["completed", "failed", "cancelled"].includes(run.status)) return mapRun(run);
      const sequence = await nextRunEventSequence(transaction, run.id);
      const [cancelled] = await transaction
        .update(agentRuns)
        .set({
          status: "cancelled",
          cancelledAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .where(eq(agentRuns.id, run.id))
        .returning();
      await insertRunEvent(transaction, {
        run,
        sequence,
        eventType: "run.cancelled",
        payload: { version: 1 },
        occurredAt: input.occurredAt
      });
      return cancelled ? mapRun(cancelled) : null;
    });
  }

  public listRunEvents(
    input: Parameters<ConversationRepository["listRunEvents"]>[0]
  ): Promise<RunEventPage | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await transaction
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.userId, input.userId),
            eq(agentRuns.conversationId, input.conversationId),
            eq(agentRuns.id, input.runId)
          )
        )
        .limit(1);
      if (!run) return null;
      const events = await transaction
        .select()
        .from(runEvents)
        .where(
          and(
            eq(runEvents.userId, input.userId),
            eq(runEvents.runId, input.runId),
            sql`${runEvents.sequence} > ${input.afterSequence}`
          )
        )
        .orderBy(asc(runEvents.sequence))
        .limit(input.limit);
      return { events: events.map(mapEvent), status: run.status };
    });
  }

  private executeForUser<TResult>(
    userId: string,
    work: (transaction: DatabaseTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_user_id', ${userId}, true)`
      );
      return work(transaction);
    });
  }
}

async function findExistingSubmission(
  transaction: DatabaseTransaction,
  input: Parameters<ConversationRepository["enqueueMessage"]>[0]
): Promise<ConversationSubmission | null> {
  const [existing] = await transaction
    .select({
      runId: agentRuns.id,
      conversationId: agentRuns.conversationId,
      messageId: agentRuns.userMessageId,
      contentParts: conversationMessages.contentParts
    })
    .from(agentRuns)
    .innerJoin(conversationMessages, eq(conversationMessages.id, agentRuns.userMessageId))
    .where(
      and(
        eq(agentRuns.userId, input.userId),
        eq(agentRuns.clientRequestId, input.clientRequestId)
      )
    )
    .limit(1);
  if (!existing) return null;
  if (
    existing.conversationId !== input.conversationId ||
    extractText(existing.contentParts) !== input.content
  ) {
    throw requestIdReused();
  }
  return { messageId: existing.messageId, runId: existing.runId, replayed: true };
}

function lockRun(
  transaction: DatabaseTransaction,
  input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }
) {
  return transaction
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.userId, input.userId),
        eq(agentRuns.conversationId, input.conversationId),
        eq(agentRuns.id, input.runId)
      )
    )
    .limit(1)
    .for("update");
}

async function nextRunEventSequence(
  transaction: DatabaseTransaction,
  runId: string
): Promise<number> {
  const [row] = await transaction
    .select({
      next: sql<number>`coalesce(max(${runEvents.sequence}), 0) + 1`.mapWith(Number)
    })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  return row?.next ?? 1;
}

function insertRunEvent(
  transaction: DatabaseTransaction,
  input: {
    readonly run: RunRow;
    readonly sequence: number;
    readonly eventType: RunEventType;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly occurredAt: Date;
  }
) {
  return transaction.insert(runEvents).values({
    runId: input.run.id,
    userId: input.run.userId,
    conversationId: input.run.conversationId,
    sequence: input.sequence,
    eventType: input.eventType,
    payload: input.payload,
    occurredAt: input.occurredAt
  });
}

function mapConversation(row: ConversationRow): ConversationProps {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    status: row.status,
    lastMessageSequence: row.lastMessageSequence,
    lastActivityAt: row.lastActivityAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapMessage(row: MessageRow): ConversationMessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sequence: row.sequence,
    role: row.role,
    status: row.status,
    content: conversationMessageContentSchema.parse(row.contentParts),
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt
  };
}

function mapRun(row: RunRow): AgentRunView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userMessageId: row.userMessageId,
    status: row.status,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapEvent(row: EventRow): RunEventView {
  if (!isRunEventType(row.eventType) || !isRecord(row.payload)) {
    throw new Error("Stored run event is invalid.");
  }
  return {
    id: String(row.sequence),
    runId: row.runId,
    sequence: row.sequence,
    type: row.eventType,
    payload: row.payload,
    occurredAt: row.occurredAt
  };
}

function textContent(text: string) {
  return { version: 1 as const, parts: [{ type: "text" as const, text }] };
}

function extractText(value: unknown): string {
  const content = conversationMessageContentSchema.parse(value);
  const text = content.parts.find((part) => part.type === "text");
  if (!text || text.type !== "text") throw new Error("Message has no text content.");
  return text.text;
}

function isRunEventType(value: string): value is RunEventType {
  return [
    "run.queued",
    "run.started",
    "assistant.delta",
    "run.completed",
    "run.failed",
    "run.cancelled"
  ].includes(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("constraint" in error))
    return null;
  return typeof error.constraint === "string" ? error.constraint : null;
}

function conversationNotFound(): ConversationError {
  return new ConversationError("CONVERSATION_NOT_FOUND", "Conversation not found.");
}

function runActive(): ConversationError {
  return new ConversationError(
    "CONVERSATION_RUN_ACTIVE",
    "Wait for the current response to finish before sending another message."
  );
}

function requestIdReused(): ConversationError {
  return new ConversationError(
    "CONVERSATION_REQUEST_ID_REUSED",
    "This request identifier was already used for different message content."
  );
}
