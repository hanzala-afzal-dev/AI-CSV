import { z } from "zod";

export const queueJobNameSchema = z.enum([
  "dataset.ingest.v1",
  "knowledge.index.v1",
  "outbox.publish.v1"
]);

export const queuePayloadBaseSchema = z.object({
  schemaVersion: z.literal(1),
  jobName: queueJobNameSchema,
  correlationId: z.string().min(1),
  ownerId: z.string().min(1),
  idempotencyKey: z.string().min(16)
});

export const datasetIngestionJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("dataset.ingest.v1"),
  datasetId: z.string().uuid(),
  objectKey: z.string().min(1)
});

export const knowledgeIndexJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("knowledge.index.v1"),
  source: z.enum(["knowledge-base", "dataset-schema"]),
  datasetId: z.string().uuid().optional()
});

export const outboxPublishJobPayloadSchema = queuePayloadBaseSchema.extend({
  jobName: z.literal("outbox.publish.v1"),
  batchSize: z.number().int().positive().max(100)
});

export type QueueJobName = z.infer<typeof queueJobNameSchema>;
export type DatasetIngestionJobPayload = z.infer<typeof datasetIngestionJobPayloadSchema>;
export type KnowledgeIndexJobPayload = z.infer<typeof knowledgeIndexJobPayloadSchema>;
export type OutboxPublishJobPayload = z.infer<typeof outboxPublishJobPayloadSchema>;
