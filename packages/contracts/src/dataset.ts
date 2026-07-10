import { z } from "zod";

export const datasetStatusSchema = z.enum([
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed"
]);

export const createDatasetRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    originalFilename: z.string().trim().min(1).max(255)
  })
  .strict();

export const uploadContentTypeSchema = z.enum([
  "text/csv",
  "application/csv",
  "text/plain"
]);

export const initiateDatasetUploadRequestSchema = z
  .object({
    contentType: uploadContentTypeSchema,
    sizeBytes: z.number().int().positive(),
    checksumSha256: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/, "Expected a base64-encoded SHA-256 checksum.")
  })
  .strict();

export const completeDatasetUploadRequestSchema = z
  .object({
    uploadIntentId: z.string().uuid()
  })
  .strict();

export const uploadIntentResponseSchema = z.object({
  uploadIntentId: z.string().uuid(),
  objectKey: z.string().min(1),
  uploadUrl: z.string().url(),
  method: z.literal("PUT"),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime()
});

export const uploadCompletionResponseSchema = z.object({
  datasetId: z.string().uuid(),
  status: z.literal("uploaded"),
  ingestionRequested: z.literal(true)
});

export type DatasetStatusContract = z.infer<typeof datasetStatusSchema>;
export type CreateDatasetRequest = z.infer<typeof createDatasetRequestSchema>;
export type InitiateDatasetUploadRequest = z.infer<
  typeof initiateDatasetUploadRequestSchema
>;
export type CompleteDatasetUploadRequest = z.infer<
  typeof completeDatasetUploadRequestSchema
>;
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;
export type UploadCompletionResponse = z.infer<typeof uploadCompletionResponseSchema>;
