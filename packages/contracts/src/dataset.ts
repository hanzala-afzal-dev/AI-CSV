import { z } from "zod";

export const datasetStatusSchema = z.enum([
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed",
  "deleting"
]);

export const datasetVersionStatusSchema = z.enum([
  "pending_upload",
  "uploaded",
  "queued",
  "validating",
  "profiling",
  "indexing",
  "ready",
  "failed",
  "deleting",
  "deleted"
]);

export const datasetFailureCodeSchema = z.enum([
  "DATASET_INVALID_FILE",
  "DATASET_ENCODING_UNSUPPORTED",
  "DATASET_MALFORMED_CSV",
  "DATASET_EMPTY_FILE",
  "DATASET_ROW_LIMIT_EXCEEDED",
  "DATASET_COLUMN_LIMIT_EXCEEDED",
  "DATASET_FIELD_LIMIT_EXCEEDED",
  "DATASET_ROW_WIDTH_LIMIT_EXCEEDED",
  "DATASET_PROFILE_TIMEOUT",
  "DATASET_PROCESSING_FAILED",
  "DATASET_OBJECT_METADATA_MISMATCH",
  "DATASET_CHECKSUM_MISMATCH",
  "DATASET_JOB_CONTEXT_INVALID"
]);

const csvFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => value.toLowerCase().endsWith(".csv"), {
    message: "Only .csv files are accepted."
  })
  .refine(
    (value) =>
      !value.includes("/") &&
      !value.includes("\\") &&
      !Array.from(value).some((character) => character.charCodeAt(0) < 32),
    { message: "Filename contains unsupported characters." }
  );

export const createDatasetRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    originalFilename: csvFilenameSchema
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
  .object({ uploadIntentId: z.string().uuid() })
  .strict();

export const uploadIntentResponseSchema = z
  .object({
    uploadIntentId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    uploadUrl: z.string().url(),
    method: z.literal("PUT"),
    requiredHeaders: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime()
  })
  .strict();

export const uploadCompletionResponseSchema = z
  .object({
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    status: z.literal("uploaded"),
    ingestionRequested: z.literal(true)
  })
  .strict();

export const datasetVersionSummarySchema = z
  .object({
    id: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    originalFilename: csvFilenameSchema,
    mimeType: uploadContentTypeSchema,
    sizeBytes: z.number().int().nonnegative(),
    status: datasetVersionStatusSchema,
    failureCode: datasetFailureCodeSchema.nullable(),
    rowCount: z.number().int().nonnegative().nullable(),
    columnCount: z.number().int().positive().nullable(),
    profileVersion: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const datasetSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120),
    originalFilename: csvFilenameSchema,
    status: datasetStatusSchema,
    rowCount: z.number().int().nonnegative().nullable(),
    columnCount: z.number().int().positive().nullable(),
    activeVersion: datasetVersionSummarySchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const datasetDetailSchema = datasetSummarySchema
  .extend({ versions: z.array(datasetVersionSummarySchema).max(50) })
  .strict();

export const datasetListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(30) })
  .strict();

export const datasetLimitsSchema = z
  .object({
    maxBytes: z.number().int().positive(),
    maxRows: z.number().int().positive(),
    maxColumns: z.number().int().positive(),
    maxFieldCharacters: z.number().int().positive()
  })
  .strict();

export const datasetListResponseSchema = z
  .object({
    datasets: z.array(datasetSummarySchema),
    limits: datasetLimitsSchema
  })
  .strict();

export const datasetColumnTypeSchema = z.enum([
  "integer",
  "decimal",
  "boolean",
  "date",
  "timestamp",
  "text"
]);

export const datasetColumnSemanticTypeSchema = z.enum([
  "identifier",
  "numeric",
  "date",
  "categorical",
  "free_text"
]);

export const datasetColumnStatisticsSchema = z
  .object({
    version: z.literal(1),
    nullCount: z.number().int().nonnegative(),
    nullPercentage: z.number().min(0).max(100),
    distinctCount: z.number().int().nonnegative(),
    min: z.string().max(500).nullable(),
    max: z.string().max(500).nullable(),
    mean: z.number().finite().nullable(),
    standardDeviation: z.number().finite().nonnegative().nullable(),
    exampleValues: z.array(z.string().max(160)).max(5)
  })
  .strict();

export const datasetColumnProfileSchema = z
  .object({
    ordinal: z.number().int().nonnegative(),
    originalName: z.string().min(1).max(500),
    canonicalName: z.string().min(1).max(160),
    inferredType: datasetColumnTypeSchema,
    semanticType: datasetColumnSemanticTypeSchema,
    nullable: z.boolean(),
    statistics: datasetColumnStatisticsSchema
  })
  .strict();

export const datasetProfileWarningSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9_]{1,80}$/),
    message: z.string().min(1).max(300)
  })
  .strict();

export const datasetProfileSchema = z
  .object({
    version: z.literal(1),
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().positive(),
    encoding: z.literal("utf-8"),
    delimiter: z.enum([",", ";", "\t", "|"]),
    columns: z.array(datasetColumnProfileSchema).min(1),
    warnings: z.array(datasetProfileWarningSchema).max(50),
    suggestedPrompts: z.array(z.string().min(1).max(300)).min(3).max(6),
    generatedAt: z.string().datetime()
  })
  .strict();

export const datasetProfileResponseSchema = z
  .object({
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    profile: datasetProfileSchema
  })
  .strict();

export type DatasetStatusContract = z.infer<typeof datasetStatusSchema>;
export type DatasetVersionStatusContract = z.infer<typeof datasetVersionStatusSchema>;
export type DatasetFailureCodeContract = z.infer<typeof datasetFailureCodeSchema>;
export type CreateDatasetRequest = z.infer<typeof createDatasetRequestSchema>;
export type InitiateDatasetUploadRequest = z.infer<
  typeof initiateDatasetUploadRequestSchema
>;
export type CompleteDatasetUploadRequest = z.infer<
  typeof completeDatasetUploadRequestSchema
>;
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;
export type UploadCompletionResponse = z.infer<typeof uploadCompletionResponseSchema>;
export type DatasetVersionSummaryContract = z.infer<typeof datasetVersionSummarySchema>;
export type DatasetSummaryContract = z.infer<typeof datasetSummarySchema>;
export type DatasetDetailContract = z.infer<typeof datasetDetailSchema>;
export type DatasetListResponseContract = z.infer<typeof datasetListResponseSchema>;
export type DatasetLimitsContract = z.infer<typeof datasetLimitsSchema>;
export type DatasetColumnProfileContract = z.infer<typeof datasetColumnProfileSchema>;
export type DatasetProfileWarningContract = z.infer<typeof datasetProfileWarningSchema>;
export type DatasetProfileContract = z.infer<typeof datasetProfileSchema>;
export type DatasetProfileResponseContract = z.infer<typeof datasetProfileResponseSchema>;
