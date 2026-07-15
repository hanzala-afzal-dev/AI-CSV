import { z } from "zod";

export const conversationStatusSchema = z.enum(["active", "archived"]);
export const conversationMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system_event",
  "tool"
]);
export const conversationMessageStatusSchema = z.enum(["streaming", "final", "failed"]);
export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_user",
  "completed",
  "failed",
  "cancelled"
]);

const conversationTitleSchema = z.string().trim().min(1).max(120);
const messageTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .refine(hasSupportedMessageCharacters, {
    message: "Message contains unsupported control characters."
  });

export const createConversationRequestSchema = z
  .object({ title: conversationTitleSchema.optional() })
  .strict();
export const updateConversationRequestSchema = z.union([
  z.object({ title: conversationTitleSchema }).strict(),
  z.object({ activeDatasetVersionId: z.string().uuid().nullable() }).strict()
]);
export const archiveConversationRequestSchema = z
  .object({ archived: z.boolean() })
  .strict();
export const submitConversationMessageRequestSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    content: messageTextSchema
  })
  .strict();

export const conversationListQuerySchema = z
  .object({
    view: conversationStatusSchema.default("active"),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,512}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30)
  })
  .strict();

export const textMessagePartSchema = z
  .object({ type: z.literal("text"), text: z.string().min(1).max(16_000) })
  .strict();
export const statusMessagePartSchema = z
  .object({ type: z.literal("status"), text: z.string().min(1).max(500) })
  .strict();
export const warningMessagePartSchema = z
  .object({ type: z.literal("warning"), text: z.string().min(1).max(1_000) })
  .strict();
export const conversationMessagePartSchema = z.discriminatedUnion("type", [
  textMessagePartSchema,
  statusMessagePartSchema,
  warningMessagePartSchema
]);
export const conversationMessageContentSchema = z
  .object({
    version: z.literal(1),
    parts: z.array(conversationMessagePartSchema).min(1).max(16)
  })
  .strict();

export const conversationSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: conversationTitleSchema,
    status: conversationStatusSchema,
    activeDataset: z
      .object({
        datasetId: z.string().uuid(),
        datasetVersionId: z.string().uuid()
      })
      .strict()
      .nullable(),
    lastMessageSequence: z.number().int().nonnegative(),
    lastActivityAt: z.string().datetime(),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const conversationMessageSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    sequence: z.number().int().positive(),
    role: conversationMessageRoleSchema,
    status: conversationMessageStatusSchema,
    content: conversationMessageContentSchema,
    createdAt: z.string().datetime(),
    finalizedAt: z.string().datetime().nullable()
  })
  .strict();

export const agentRunSummarySchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    userMessageId: z.string().uuid(),
    status: agentRunStatusSchema,
    eventsUrl: z.string().startsWith("/api/v1/conversations/"),
    failureCode: z.string().max(80).nullable(),
    failureMessage: z.string().max(500).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const conversationDetailSchema = z
  .object({
    conversation: conversationSummarySchema,
    messages: z.array(conversationMessageSchema),
    activeRun: agentRunSummarySchema.nullable()
  })
  .strict();

export const conversationListSchema = z
  .object({
    conversations: z.array(conversationSummarySchema),
    nextCursor: z.string().nullable()
  })
  .strict();

export const submitConversationMessageResponseSchema = z
  .object({
    messageId: z.string().uuid(),
    runId: z.string().uuid(),
    status: z.literal("queued"),
    eventsUrl: z.string().startsWith("/api/v1/conversations/")
  })
  .strict();

const runEventBase = {
  id: z.string().regex(/^\d+$/),
  runId: z.string().uuid(),
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime()
};
const versionedEmptyPayloadSchema = z.object({ version: z.literal(1) }).strict();

export const runQueuedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.queued"),
    payload: versionedEmptyPayloadSchema
  })
  .strict();
export const runStartedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.started"),
    payload: versionedEmptyPayloadSchema
  })
  .strict();
export const assistantDeltaEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("assistant.delta"),
    payload: z
      .object({ version: z.literal(1), text: z.string().min(1).max(16_000) })
      .strict()
  })
  .strict();
export const runCompletedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.completed"),
    payload: z.object({ version: z.literal(1), messageId: z.string().uuid() }).strict()
  })
  .strict();
export const runFailedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.failed"),
    payload: z
      .object({
        version: z.literal(1),
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(500)
      })
      .strict()
  })
  .strict();
export const runCancelledEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.cancelled"),
    payload: versionedEmptyPayloadSchema
  })
  .strict();

export const runEventSchema = z.discriminatedUnion("type", [
  runQueuedEventSchema,
  runStartedEventSchema,
  assistantDeltaEventSchema,
  runCompletedEventSchema,
  runFailedEventSchema,
  runCancelledEventSchema
]);

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;
export type UpdateConversationRequest = z.infer<typeof updateConversationRequestSchema>;
export type ArchiveConversationRequest = z.infer<typeof archiveConversationRequestSchema>;
export type SubmitConversationMessageRequest = z.infer<
  typeof submitConversationMessageRequestSchema
>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationMessageContent = z.infer<typeof conversationMessageContentSchema>;
export type ConversationSummaryContract = z.infer<typeof conversationSummarySchema>;
export type ConversationMessageContract = z.infer<typeof conversationMessageSchema>;
export type AgentRunSummaryContract = z.infer<typeof agentRunSummarySchema>;
export type ConversationDetailContract = z.infer<typeof conversationDetailSchema>;
export type ConversationListContract = z.infer<typeof conversationListSchema>;
export type SubmitConversationMessageResponse = z.infer<
  typeof submitConversationMessageResponseSchema
>;
export type RunEventContract = z.infer<typeof runEventSchema>;

function hasSupportedMessageCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return false;
    }
  }
  return true;
}
