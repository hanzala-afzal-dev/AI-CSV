import { z } from "zod";

export const queueJobNameSchema = z.enum([
  "dataset.ingest.v1",
  "agent.run.v1",
  "knowledge.index.v1",
  "knowledge.delete.v1",
  "outbox.publish.v1"
]);

export const queuePayloadBaseSchema = z.object({
  version: z.literal(1),
  jobName: queueJobNameSchema,
  correlationId: z.string().min(1),
  userId: z.string().uuid(),
  idempotencyKey: z.string().min(16)
});

export const datasetIngestionJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("dataset.ingest.v1"),
  datasetId: z.string().uuid(),
  datasetVersionId: z.string().uuid(),
  objectKey: z.string().min(1)
});

export const knowledgeIndexJobPayloadSchema = queuePayloadBaseSchema
  .extend({
    jobName: z.literal("knowledge.index.v1"),
    source: z.enum(["dataset-schema", "confirmed-definition"]),
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    memoryId: z.string().uuid().optional()
  })
  .superRefine((payload, context) => {
    if (payload.source === "confirmed-definition" && !payload.memoryId) {
      context.addIssue({
        code: "custom",
        path: ["memoryId"],
        message: "Confirmed-definition indexing requires a memory ID."
      });
    }
    if (payload.source === "dataset-schema" && payload.memoryId) {
      context.addIssue({
        code: "custom",
        path: ["memoryId"],
        message: "Dataset-schema indexing cannot include a memory ID."
      });
    }
  });

export const agentRunJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("agent.run.v1"),
  conversationId: z.string().uuid(),
  runId: z.string().uuid()
});

export const knowledgeDeleteJobPayloadSchema = queuePayloadBaseSchema
  .extend({
    jobName: z.literal("knowledge.delete.v1"),
    scope: z.enum(["conversation", "dataset", "user"]),
    conversationId: z.string().uuid().optional(),
    datasetId: z.string().uuid().optional()
  })
  .superRefine((payload, context) => {
    if (payload.scope === "conversation" && !payload.conversationId) {
      context.addIssue({
        code: "custom",
        path: ["conversationId"],
        message: "Conversation deletion requires a conversation ID."
      });
    }
    if (payload.scope === "dataset" && !payload.datasetId) {
      context.addIssue({
        code: "custom",
        path: ["datasetId"],
        message: "Dataset deletion requires a dataset ID."
      });
    }
    if (payload.scope !== "conversation" && payload.conversationId) {
      context.addIssue({
        code: "custom",
        path: ["conversationId"],
        message: "Only conversation deletion may include a conversation ID."
      });
    }
    if (payload.scope !== "dataset" && payload.datasetId) {
      context.addIssue({
        code: "custom",
        path: ["datasetId"],
        message: "Only dataset deletion may include a dataset ID."
      });
    }
  });

export const outboxPublishJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("outbox.publish.v1"),
  batchSize: z.number().int().positive().max(100)
});

export type QueueJobName = z.infer<typeof queueJobNameSchema>;
export type DatasetIngestionJobPayload = z.infer<typeof datasetIngestionJobPayloadSchema>;
export type AgentRunJobPayload = z.infer<typeof agentRunJobPayloadSchema>;
export type KnowledgeIndexJobPayload = z.infer<typeof knowledgeIndexJobPayloadSchema>;
export type KnowledgeDeleteJobPayload = z.infer<typeof knowledgeDeleteJobPayloadSchema>;
export type OutboxPublishJobPayload = z.infer<typeof outboxPublishJobPayloadSchema>;
