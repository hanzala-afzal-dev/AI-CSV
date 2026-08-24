import { z } from "zod";

export const suggestionSourceSchema = z.enum(["initial_profile", "follow_up_result"]);

export const suggestionKindSchema = z.enum([
  "overview",
  "row_count",
  "missing_values",
  "comparison",
  "trend",
  "correlation",
  "distribution",
  "drill_down",
  "top_values"
]);

export const promptSuggestionSchema = z
  .object({
    id: z.string().regex(/^suggestion_[0-9a-f]{24}$/),
    source: suggestionSourceSchema,
    kind: suggestionKindSchema,
    displayText: z.string().trim().min(1).max(300),
    promptText: z.string().trim().min(1).max(300),
    referencedColumnIds: z.array(z.string().uuid()).max(8),
    basedOnResultId: z.string().uuid().nullable()
  })
  .strict()
  .superRefine((suggestion, context) => {
    if (suggestion.source === "initial_profile" && suggestion.basedOnResultId) {
      context.addIssue({
        code: "custom",
        path: ["basedOnResultId"],
        message: "Initial suggestions cannot reference a result."
      });
    }
    if (suggestion.source === "follow_up_result" && !suggestion.basedOnResultId) {
      context.addIssue({
        code: "custom",
        path: ["basedOnResultId"],
        message: "Follow-up suggestions require a verified result."
      });
    }
  });

const unavailableSuggestionResponseSchema = z
  .object({
    version: z.literal(1),
    state: z.enum(["no_dataset", "not_ready"]),
    datasetVersionId: z.string().uuid().nullable(),
    initial: z.array(promptSuggestionSchema).max(0),
    followUps: z.array(promptSuggestionSchema).max(0)
  })
  .strict();

const readySuggestionResponseSchema = z
  .object({
    version: z.literal(1),
    state: z.literal("ready"),
    datasetVersionId: z.string().uuid(),
    initial: z.array(promptSuggestionSchema).min(3).max(6),
    followUps: z.array(promptSuggestionSchema).max(4)
  })
  .strict();

export const promptSuggestionResponseSchema = z.discriminatedUnion("state", [
  unavailableSuggestionResponseSchema,
  readySuggestionResponseSchema
]);

export type SuggestionSourceContract = z.infer<typeof suggestionSourceSchema>;
export type SuggestionKindContract = z.infer<typeof suggestionKindSchema>;
export type PromptSuggestionContract = z.infer<typeof promptSuggestionSchema>;
export type PromptSuggestionResponseContract = z.infer<
  typeof promptSuggestionResponseSchema
>;
