import { z } from "zod";

export const privacyDeletionScopeSchema = z.enum(["dataset", "account"]);
export const privacyDeletionStatusSchema = z.enum([
  "scheduled",
  "processing",
  "failed",
  "completed"
]);

export const privacyDeletionRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    clientRequestId: z.string().uuid()
  })
  .strict();

export const accountDeletionRequestSchema = privacyDeletionRequestSchema
  .extend({
    confirmation: z.literal("DELETE")
  })
  .strict();

export const privacyDeletionReceiptSchema = z
  .object({
    version: z.literal(1),
    deletionId: z.string().uuid(),
    scope: privacyDeletionScopeSchema,
    datasetId: z.string().uuid().nullable(),
    status: privacyDeletionStatusSchema,
    requestedAt: z.string().datetime()
  })
  .strict();

export type PrivacyDeletionScope = z.infer<typeof privacyDeletionScopeSchema>;
export type PrivacyDeletionStatus = z.infer<typeof privacyDeletionStatusSchema>;
export type PrivacyDeletionReceipt = z.infer<typeof privacyDeletionReceiptSchema>;
