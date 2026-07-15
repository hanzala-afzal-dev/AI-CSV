import { z } from "zod";

export const providerCredentialStatusSchema = z.enum([
  "unconfigured",
  "validating",
  "valid",
  "invalid",
  "revoked"
]);

export const reasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);

export const providerCredentialWriteRequestSchema = z
  .object({
    apiKey: z
      .string()
      .min(20)
      .max(512)
      .refine((value) => /^[\x21-\x7e]+$/.test(value), {
        message: "API key must contain printable characters without whitespace."
      })
  })
  .strict();

export const providerPreferenceUpdateRequestSchema = z
  .object({
    modelId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
    reasoningEffort: reasoningEffortSchema
  })
  .strict();

export const providerCredentialSummarySchema = z.object({
  provider: z.literal("openai"),
  configured: z.boolean(),
  last4: z.string().length(4).nullable(),
  status: providerCredentialStatusSchema,
  validatedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable()
});

export const providerPreferenceSchema = z.object({
  modelId: z.string().min(1).max(200),
  reasoningEffort: reasoningEffortSchema,
  reasoningMode: z.string().min(1).max(64).nullable(),
  modelValidatedAt: z.string().datetime()
});

export const providerModelSchema = z.object({
  id: z.string().min(1).max(200),
  reasoningEfforts: z.array(reasoningEffortSchema).min(1)
});

export const providerSettingsSchema = z.object({
  credential: providerCredentialSummarySchema,
  preference: providerPreferenceSchema.nullable()
});

export const providerModelsSchema = z.object({
  models: z.array(providerModelSchema).max(500)
});

export const emptyJsonRequestSchema = z.object({}).strict();

export type ProviderCredentialWriteRequest = z.infer<
  typeof providerCredentialWriteRequestSchema
>;
export type ProviderPreferenceUpdateRequest = z.infer<
  typeof providerPreferenceUpdateRequestSchema
>;
export type ProviderCredentialSummaryContract = z.infer<
  typeof providerCredentialSummarySchema
>;
export type ProviderPreferenceContract = z.infer<typeof providerPreferenceSchema>;
export type ProviderModelContract = z.infer<typeof providerModelSchema>;
export type ProviderSettingsContract = z.infer<typeof providerSettingsSchema>;
