import { z } from "zod";

export const agentAnalysisStateSchema = z.object({
  correlationId: z.string().min(1),
  ownerId: z.string().min(1),
  datasetId: z.string().uuid(),
  datasetVersion: z.number().int().positive().optional(),
  question: z.string().min(1),
  retrievedContext: z.array(z.string()).default([]),
  plannedSteps: z.array(z.string()).default([])
});

export const agentAnalysisOutputSchema = z.object({
  answer: z.string(),
  calculationVerified: z.boolean(),
  chartSpec: z.record(z.string(), z.unknown()).nullable(),
  deferredReason: z.string().nullable()
});

export type AgentAnalysisStateContract = z.infer<typeof agentAnalysisStateSchema>;
export type AgentAnalysisOutputContract = z.infer<typeof agentAnalysisOutputSchema>;
