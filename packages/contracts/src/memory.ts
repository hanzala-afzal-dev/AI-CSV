import { z } from "zod";

export const memoryDocumentTypeSchema = z.enum([
  "dataset_description",
  "column_profile",
  "business_rule"
]);

export const memoryConfidenceSchema = z.enum(["confirmed", "verified"]);

export const memoryIndexStatusSchema = z.enum([
  "pending",
  "indexing",
  "indexed",
  "failed",
  "deleting"
]);

export const confirmedDatasetDefinitionSchema = z
  .object({
    version: z.literal(1),
    alias: z.string().trim().min(1).max(120),
    columnId: z.string().uuid(),
    columnName: z.string().trim().min(1).max(255),
    clarificationId: z.string().uuid(),
    sourceMessageId: z.string().uuid()
  })
  .strict();

export const retrievedMemoryContextSchema = z
  .object({
    sourceId: z.string().uuid(),
    documentType: memoryDocumentTypeSchema,
    content: z.string().trim().min(1).max(4_000),
    score: z.number().finite().min(0).max(1),
    confidence: memoryConfidenceSchema.nullable(),
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    definition: confirmedDatasetDefinitionSchema.nullable()
  })
  .strict();

export const memoryRetrievalResultSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    items: z.array(retrievedMemoryContextSchema).max(20)
  })
  .strict();

export type MemoryDocumentTypeContract = z.infer<typeof memoryDocumentTypeSchema>;
export type MemoryConfidenceContract = z.infer<typeof memoryConfidenceSchema>;
export type MemoryIndexStatusContract = z.infer<typeof memoryIndexStatusSchema>;
export type ConfirmedDatasetDefinitionContract = z.infer<
  typeof confirmedDatasetDefinitionSchema
>;
export type RetrievedMemoryContextContract = z.infer<typeof retrievedMemoryContextSchema>;
export type MemoryRetrievalResultContract = z.infer<typeof memoryRetrievalResultSchema>;
