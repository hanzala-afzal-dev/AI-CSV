import { z } from "zod";
import {
  analysisPlanDraftSchema,
  analysisPlanSchema,
  analysisResultRowSchema,
  analysisTimeGrainSchema,
  resultColumnSchema
} from "./analysis";
import { retrievedMemoryContextSchema } from "./memory";

export const queryIntentSchema = z.enum([
  "conversation_history",
  "dataset_overview",
  "schema_question",
  "aggregation",
  "comparison",
  "trend",
  "distribution",
  "correlation",
  "data_quality",
  "textual_search",
  "clarification_answer",
  "unsupported"
]);

export const agentConversationTurnSchema = z
  .object({
    messageId: z.string().uuid(),
    sequence: z.number().int().positive(),
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4_000)
  })
  .strict();

export const agentProgressStageSchema = z.enum([
  "authorizing",
  "planning",
  "validating",
  "analyzing",
  "verifying",
  "explaining"
]);

export const agentColumnContextSchema = z
  .object({
    id: z.string().uuid(),
    originalName: z.string().min(1).max(255),
    canonicalName: z.string().min(1).max(255),
    inferredType: z.enum(["integer", "decimal", "boolean", "date", "timestamp", "text"]),
    semanticType: z.enum(["identifier", "numeric", "date", "categorical", "free_text"]),
    nullable: z.boolean()
  })
  .strict();

export const agentClarificationOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    columnId: z.string().uuid().nullable()
  })
  .strict();

export const agentClarificationSchema = z
  .object({
    id: z.string().uuid(),
    question: z.string().trim().min(1).max(500),
    options: z.array(agentClarificationOptionSchema).max(8),
    status: z.enum(["pending", "answered"]),
    answer: z.string().trim().min(1).max(2_000).nullable()
  })
  .strict();

export const agentErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
    message: z.string().min(1).max(500),
    retryable: z.boolean()
  })
  .strict();

export const agentGraphPhaseSchema = z.enum(["initial", "resuming", "waiting_for_user"]);

export const agentAnalysisStateSchema = z
  .object({
    version: z.literal(1),
    correlationId: z.string().uuid(),
    runId: z.string().uuid(),
    conversationId: z.string().uuid(),
    userId: z.string().uuid(),
    userMessageId: z.string().uuid(),
    question: z.string().trim().min(1).max(8_000),
    phase: agentGraphPhaseSchema,
    datasetId: z.string().uuid().nullable(),
    datasetVersionId: z.string().uuid().nullable(),
    datasetName: z.string().min(1).max(120).nullable(),
    originalFilename: z.string().min(1).max(255).nullable(),
    columns: z.array(agentColumnContextSchema).max(512),
    conversationHistory: z.array(agentConversationTurnSchema).max(12).default([]),
    retrievedContext: z.array(retrievedMemoryContextSchema).max(20),
    intent: queryIntentSchema.nullable(),
    plan: analysisPlanSchema.nullable(),
    clarification: agentClarificationSchema.nullable(),
    assumptions: z.array(z.string().max(500)).max(32),
    warnings: z.array(z.string().max(1_000)).max(32),
    errors: z.array(agentErrorSchema).max(16),
    validationErrors: z.array(z.string().max(500)).max(16),
    selectedModel: z.string().min(1).max(200),
    selectedReasoningEffort: z.string().min(1).max(32),
    stepCount: z.number().int().min(0).max(100),
    repairCount: z.number().int().min(0).max(20),
    toolCallCount: z.number().int().min(0).max(100),
    updatedAt: z.string().datetime()
  })
  .strict();

export const agentPlanningDecisionDraftSchema = z
  .object({
    intent: queryIntentSchema,
    plan: analysisPlanDraftSchema.nullable(),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().min(1).max(500).nullable(),
    clarificationOptions: z.array(agentClarificationOptionSchema).max(8),
    assumptions: z.array(z.string().max(500)).max(16),
    directResponse: z.string().trim().min(1).max(2_000).nullable().optional()
  })
  .strict();

export const agentPlanningDecisionSchema = z
  .object({
    ...agentPlanningDecisionDraftSchema.shape,
    plan: analysisPlanSchema.nullable()
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.requiresClarification && !decision.clarificationQuestion) {
      context.addIssue({
        code: "custom",
        message: "A clarification question is required when execution is blocked.",
        path: ["clarificationQuestion"]
      });
    }
    if (
      decision.intent === "conversation_history" &&
      (decision.requiresClarification ||
        decision.plan !== null ||
        !decision.directResponse)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Conversation history requests require a direct response without a plan or clarification.",
        path: ["directResponse"]
      });
    }
    if (
      !decision.requiresClarification &&
      !["conversation_history", "unsupported"].includes(decision.intent) &&
      !decision.plan
    ) {
      context.addIssue({
        code: "custom",
        message: "A plan is required for a supported unambiguous request.",
        path: ["plan"]
      });
    }
    if (
      !["conversation_history", "unsupported"].includes(decision.intent) &&
      decision.directResponse != null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only unsupported or informational requests may return direct prose.",
        path: ["directResponse"]
      });
    }
  });

// OpenAI strict structured outputs require every object property to be required.
// The application contract remains backward-compatible by normalizing null to absence.
export const agentPlanningDecisionModelOutputSchema = z
  .object({
    intent: queryIntentSchema,
    plan: z
      .object({
        ...analysisPlanDraftSchema.shape,
        timeGrain: analysisTimeGrainSchema.nullable()
      })
      .strict()
      .nullable(),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().min(1).max(500).nullable(),
    clarificationOptions: z.array(agentClarificationOptionSchema).max(8),
    assumptions: z.array(z.string().max(500)).max(16),
    directResponse: z.string().trim().min(1).max(2_000).nullable()
  })
  .strict();

export const agentExplanationSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    highlights: z
      .array(
        z
          .object({
            rowIndex: z.number().int().min(0).max(199),
            field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
            label: z.string().trim().min(1).max(160)
          })
          .strict()
      )
      .max(5),
    warnings: z.array(z.string().trim().min(1).max(500)).max(8)
  })
  .strict();

export const agentAnalysisOutputSchema = z
  .object({
    answer: z.string().min(1).max(16_000),
    calculationVerified: z.boolean(),
    resultSchema: z.array(resultColumnSchema).max(20),
    previewRows: z.array(analysisResultRowSchema).max(200),
    deferredReason: z.string().max(500).nullable()
  })
  .strict();

export type QueryIntent = z.infer<typeof queryIntentSchema>;
export type AgentProgressStage = z.infer<typeof agentProgressStageSchema>;
export type AgentColumnContextContract = z.infer<typeof agentColumnContextSchema>;
export type AgentConversationTurnContract = z.infer<typeof agentConversationTurnSchema>;
export type AgentClarificationContract = z.infer<typeof agentClarificationSchema>;
export type AgentAnalysisStateContract = z.infer<typeof agentAnalysisStateSchema>;
export type AgentPlanningDecisionDraftContract = z.infer<
  typeof agentPlanningDecisionDraftSchema
>;
export type AgentPlanningDecisionContract = z.infer<typeof agentPlanningDecisionSchema>;
export type AgentPlanningDecisionModelOutputContract = z.infer<
  typeof agentPlanningDecisionModelOutputSchema
>;
export type AgentExplanationContract = z.infer<typeof agentExplanationSchema>;
export type AgentAnalysisOutputContract = z.infer<typeof agentAnalysisOutputSchema>;
