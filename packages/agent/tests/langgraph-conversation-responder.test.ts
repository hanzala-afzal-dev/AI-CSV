import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AgentError,
  type AgentCheckpointRecord,
  type AgentCheckpointRepository,
  type AgentModelSession,
  type AgentProviderService,
  type AnalysisService,
  type ConversationRepository
} from "@agentic-csv/application";
import {
  agentAnalysisStateSchema,
  analysisPlanSchema,
  type AgentAnalysisStateContract,
  type AgentPlanningDecisionDraftContract,
  type AgentPlanningDecisionContract
} from "@agentic-csv/contracts";
import { LangGraphConversationResponder } from "../src";

const userId = randomUUID();
const conversationId = randomUUID();
const runId = randomUUID();
const userMessageId = randomUUID();
const correlationId = randomUUID();
const datasetId = randomUUID();
const datasetVersionId = randomUUID();
const regionId = randomUUID();
const grossRevenueId = randomUUID();
const netRevenueId = randomUUID();
const dateOfBirthId = randomUUID();
const now = new Date("2026-08-05T12:00:00.000Z");

const columns = [
  column(regionId, "region", "text", "categorical"),
  column(grossRevenueId, "gross_revenue", "decimal", "numeric"),
  column(netRevenueId, "net_revenue", "decimal", "numeric")
];
const dateOfBirthColumn = {
  id: dateOfBirthId,
  originalName: "Date of birth",
  canonicalName: "date_of_birth",
  inferredType: "date",
  semanticType: "date",
  nullable: false
} as const;

describe("LangGraphConversationResponder", () => {
  it("repairs a structurally valid plan that violates semantic measure rules", async () => {
    const invalidDecision: AgentPlanningDecisionDraftContract = {
      intent: "dataset_overview",
      plan: {
        version: 1,
        operation: "quality",
        dimensions: [],
        measures: [],
        filters: [],
        sort: [],
        limit: 100,
        visualizationPreference: "table",
        assumptions: []
      },
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: [],
      directResponse: null
    };
    const repairedPlan = analysisPlanSchema.parse({
      ...invalidDecision.plan,
      measures: [{ columnId: regionId, aggregation: "null_count" }]
    });
    const repairedDecision: AgentPlanningDecisionContract = {
      ...invalidDecision,
      plan: repairedPlan
    };
    const model = modelSession(invalidDecision);
    vi.mocked(model.createPlan)
      .mockResolvedValueOnce(invalidDecision)
      .mockResolvedValueOnce(repairedDecision);
    const responder = responderWith({
      checkpoints: new MemoryCheckpointRepository(),
      model,
      analysis: analysisService(repairedPlan)
    });

    const response = await responder.respond({
      ...runInput(),
      content: "Hi, whats my CSV is about"
    });

    expect(response).toMatchObject({
      state: "completed",
      metrics: { repairCount: 1 }
    });
    expect(model.createPlan).toHaveBeenCalledTimes(2);
    expect(model.createPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        validationErrors: ["plan.measures: The operation requires at least one measure."]
      })
    );
  });

  it("repairs unsupported analysis requests into a schema-grounded clarification", async () => {
    const unsupported: AgentPlanningDecisionContract = {
      intent: "unsupported",
      plan: null,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: [],
      directResponse: "Revenue is not available."
    };
    const clarification: AgentPlanningDecisionContract = {
      intent: "comparison",
      plan: null,
      requiresClarification: true,
      clarificationQuestion:
        "There is no revenue column. Should I chart record count by region instead?",
      clarificationOptions: [
        {
          value: "record_count_by_region",
          label: "Record count by region",
          columnId: regionId
        }
      ],
      assumptions: [],
      directResponse: null
    };
    const model = modelSession(unsupported);
    vi.mocked(model.createPlan)
      .mockResolvedValueOnce(unsupported)
      .mockResolvedValueOnce(clarification);
    const fallbackPlan = analysisPlanSchema.parse({
      version: 1,
      operation: "compare",
      dimensions: [{ columnId: regionId }],
      measures: [{ columnId: null, aggregation: "count" }],
      filters: [],
      sort: [],
      limit: 100,
      visualizationPreference: "bar",
      assumptions: []
    });
    const analysis = analysisService(fallbackPlan, [columns[0]!]);
    const responder = responderWith({
      checkpoints: new MemoryCheckpointRepository(),
      model,
      analysis
    });

    const response = await responder.respond({
      ...runInput(),
      content: "build me a revenue chart properly"
    });

    expect(response).toMatchObject({
      state: "waiting_for_user",
      metrics: { repairCount: 1 },
      clarification: {
        question: expect.stringContaining("no revenue column"),
        options: [expect.objectContaining({ columnId: regionId })]
      }
    });
    expect(model.createPlan).toHaveBeenCalledTimes(2);
    expect(analysis.executePlan).not.toHaveBeenCalled();
    expect(model.createPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        validationErrors: [expect.stringContaining("clarification")]
      })
    );
  });

  it("uses bounded model prose for informational capability questions", async () => {
    const model = modelSession({
      intent: "unsupported",
      plan: null,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: [],
      directResponse: "I can return tables and bar, line, pie, or scatter charts."
    });
    const analysis = analysisService(
      analysisPlanSchema.parse({
        version: 1,
        operation: "quality",
        dimensions: [],
        measures: [{ columnId: regionId, aggregation: "null_count" }],
        filters: [],
        sort: [],
        limit: 100,
        visualizationPreference: "table",
        assumptions: []
      })
    );
    const responder = responderWith({
      checkpoints: new MemoryCheckpointRepository(),
      model,
      analysis
    });

    const response = await responder.respond({
      ...runInput(),
      content: "What graphs can you build?"
    });

    expect(response).toMatchObject({
      state: "completed",
      text: "I can return tables and bar, line, pie, or scatter charts."
    });
    expect(model.createPlan).toHaveBeenCalledTimes(1);
    expect(analysis.executePlan).not.toHaveBeenCalled();
  });

  it("returns the verified result when model explanation formatting fails", async () => {
    const plan = analysisPlanSchema.parse({
      version: 1,
      operation: "compare",
      dimensions: [{ columnId: regionId }],
      measures: [{ columnId: netRevenueId, aggregation: "sum" }],
      filters: [],
      sort: [],
      limit: 100,
      visualizationPreference: "bar",
      assumptions: []
    });
    const model = modelSession({
      intent: "comparison",
      plan,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: []
    });
    vi.mocked(model.createExplanation).mockRejectedValueOnce(
      new AgentError(
        "AGENT_PROVIDER_OUTPUT_INVALID",
        "OpenAI returned an invalid structured analytical response.",
        true
      )
    );
    const checkpoints = new MemoryCheckpointRepository();
    const responder = responderWith({
      checkpoints,
      model,
      analysis: analysisService(plan)
    });

    const response = await responder.respond({
      ...runInput(),
      content: "Show net revenue by region"
    });

    expect(response).toMatchObject({
      state: "completed",
      text: expect.stringContaining("verified analysis completed"),
      analysis: expect.objectContaining({ resultId: expect.any(String) })
    });
    expect(checkpoints.current?.state.warnings).toContain(
      "The provider explanation was unavailable; the verified result is unchanged."
    );
  });

  it("pauses before a model call and resumes the same checkpoint after reload", async () => {
    const checkpoints = new MemoryCheckpointRepository();
    const plan = analysisPlanSchema.parse({
      version: 1,
      operation: "compare",
      dimensions: [{ columnId: regionId }],
      measures: [{ columnId: netRevenueId, aggregation: "sum" }],
      filters: [],
      sort: [{ target: "measure", index: 0, direction: "desc" }],
      limit: 100,
      visualizationPreference: "bar",
      assumptions: []
    });
    const model = modelSession(
      {
        intent: "comparison",
        plan,
        requiresClarification: false,
        clarificationQuestion: null,
        clarificationOptions: [],
        assumptions: []
      },
      "The verified result is 120."
    );
    const analysis = analysisService(plan);
    const responder = responderWith({ checkpoints, model, analysis });

    const waiting = await responder.respond(runInput());

    expect(waiting).toMatchObject({
      state: "waiting_for_user",
      clarification: {
        question: "Which revenue definition should be used for this analysis?"
      }
    });
    expect(model.createPlan).not.toHaveBeenCalled();
    expect(vi.mocked(analysis.executePlan)).not.toHaveBeenCalled();
    expect(JSON.stringify(checkpoints.current?.state)).not.toContain("objectKey");
    expect(JSON.stringify(checkpoints.current?.state)).not.toContain("sk-");

    checkpoints.answer("net_revenue");
    const resumedResponder = responderWith({ checkpoints, model, analysis });
    const completed = await resumedResponder.respond(runInput());

    expect(completed).toMatchObject({ state: "completed" });
    if (completed.state !== "completed") throw new Error("Expected completion.");
    expect(completed.text).toContain("The requested analysis completed successfully.");
    expect(completed.text).not.toContain("The verified result is 120.");
    expect(completed.text).toContain("Net revenue: 120");
    expect(model.createPlan).toHaveBeenCalledTimes(1);
    expect(analysis.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          measures: [{ columnId: netRevenueId, aggregation: "sum" }]
        })
      })
    );
    expect(checkpoints.current?.state.runId).toBe(runId);
    expect(checkpoints.current?.state.clarification).toMatchObject({
      status: "answered",
      answer: "net_revenue"
    });
  });

  it("accepts a selected clarification column used as a trend dimension", async () => {
    const checkpoints = new MemoryCheckpointRepository();
    const clarification: AgentPlanningDecisionContract = {
      intent: "trend",
      plan: null,
      requiresClarification: true,
      clarificationQuestion:
        "What should the line chart show? Please choose the date or x-axis and the measure to plot.",
      clarificationOptions: [
        {
          value: "count_by_date_of_birth_year",
          label: "Count records by year of Date of birth",
          columnId: dateOfBirthId
        }
      ],
      assumptions: []
    };
    const plan = analysisPlanSchema.parse({
      version: 1,
      operation: "trend",
      dimensions: [{ columnId: dateOfBirthId }],
      measures: [{ columnId: null, aggregation: "count" }],
      filters: [],
      timeGrain: "year",
      sort: [{ target: "dimension", index: 0, direction: "asc" }],
      limit: 100,
      visualizationPreference: "line",
      assumptions: ["Using the selected date-of-birth option."]
    });
    const planned: AgentPlanningDecisionContract = {
      intent: "trend",
      plan,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: ["Using the selected date-of-birth option."]
    };
    const model = modelSession(clarification);
    vi.mocked(model.createPlan)
      .mockResolvedValueOnce(clarification)
      .mockResolvedValue(planned);
    const analysis = analysisService(plan, [dateOfBirthColumn]);
    const responder = responderWith({ checkpoints, model, analysis });
    const input = { ...runInput(), content: "Can you create line chart?" };

    const waiting = await responder.respond(input);
    expect(waiting).toMatchObject({ state: "waiting_for_user" });

    checkpoints.answer("count_by_date_of_birth_year");
    const completed = await responderWith({
      checkpoints,
      model,
      analysis
    }).respond(input);

    expect(completed).toMatchObject({
      state: "completed",
      metrics: { repairCount: 0 }
    });
    expect(model.createPlan).toHaveBeenCalledTimes(2);
    expect(analysis.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          dimensions: [{ columnId: dateOfBirthId }],
          measures: [{ columnId: null, aggregation: "count" }]
        })
      })
    );
  });

  it("stops after the configured structured-plan repair limit", async () => {
    const invalidPlan = analysisPlanSchema.parse({
      version: 1,
      operation: "aggregate",
      dimensions: [],
      measures: [{ columnId: randomUUID(), aggregation: "sum" }],
      filters: [],
      sort: [],
      limit: 100,
      visualizationPreference: "table",
      assumptions: []
    });
    const decision: AgentPlanningDecisionContract = {
      intent: "aggregation",
      plan: invalidPlan,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: []
    };
    const model = modelSession(decision);
    const responder = responderWith({
      checkpoints: new MemoryCheckpointRepository(),
      model,
      analysis: analysisService(invalidPlan),
      policy: { maxSteps: 20, maxRepairs: 2, maxToolCalls: 12, maxResultRowsToModel: 20 }
    });

    await expect(
      responder.respond({ ...runInput(), content: "Total net revenue" })
    ).rejects.toMatchObject({
      code: "ANALYSIS_PLAN_UNRESOLVED"
    });
    expect(model.createPlan).toHaveBeenCalledTimes(3);
  });

  it("checks durable cancellation before performing graph work", async () => {
    const model = modelSession({
      intent: "dataset_overview",
      plan: null,
      requiresClarification: false,
      clarificationQuestion: null,
      clarificationOptions: [],
      assumptions: []
    });
    const analysis = analysisService(
      analysisPlanSchema.parse({
        version: 1,
        operation: "quality",
        dimensions: [],
        measures: [{ columnId: regionId, aggregation: "null_count" }],
        filters: [],
        sort: [],
        limit: 100,
        visualizationPreference: "table",
        assumptions: []
      })
    );
    const responder = responderWith({
      checkpoints: new MemoryCheckpointRepository(),
      model,
      analysis,
      cancelled: true
    });

    await expect(responder.respond(runInput())).rejects.toMatchObject({
      code: "AGENT_CANCELLED"
    });
    expect(analysis.loadProfile).not.toHaveBeenCalled();
    expect(model.createPlan).not.toHaveBeenCalled();
  });
});

class MemoryCheckpointRepository implements AgentCheckpointRepository {
  public current: AgentCheckpointRecord | null = null;

  public async load(): Promise<AgentCheckpointRecord | null> {
    return this.current;
  }

  public async save(input: {
    readonly state: AgentAnalysisStateContract;
    readonly expectedRevision: number | null;
  }): Promise<AgentCheckpointRecord> {
    expect(input.expectedRevision).toBe(this.current?.revision ?? null);
    this.current = {
      state: agentAnalysisStateSchema.parse(input.state),
      revision: (this.current?.revision ?? 0) + 1
    };
    return this.current;
  }

  public answer(answer: string): void {
    if (!this.current?.state.clarification) throw new Error("Missing clarification.");
    this.current = {
      revision: this.current.revision + 1,
      state: agentAnalysisStateSchema.parse({
        ...this.current.state,
        phase: "resuming",
        clarification: {
          ...this.current.state.clarification,
          status: "answered",
          answer
        },
        updatedAt: new Date(now.getTime() + 1_000).toISOString()
      })
    };
  }
}

function responderWith(input: {
  readonly checkpoints: MemoryCheckpointRepository;
  readonly model: AgentModelSession;
  readonly analysis: AnalysisService;
  readonly policy?: {
    readonly maxSteps: number;
    readonly maxRepairs: number;
    readonly maxToolCalls: number;
    readonly maxResultRowsToModel: number;
  };
  readonly cancelled?: boolean;
}) {
  const provider = {
    withSession: vi.fn(async (_userId, _selection, work) => work(input.model))
  } as unknown as AgentProviderService;
  const conversations = {
    recordRunProgress: vi.fn(async () => true),
    isRunCancelled: vi.fn(async () => input.cancelled ?? false)
  } as unknown as ConversationRepository;
  return new LangGraphConversationResponder(
    input.analysis,
    provider,
    input.checkpoints,
    conversations,
    input.policy ?? {
      maxSteps: 20,
      maxRepairs: 2,
      maxToolCalls: 12,
      maxResultRowsToModel: 20
    },
    () => now,
    () => randomUUID()
  );
}

function modelSession(
  decision: AgentPlanningDecisionDraftContract,
  summary = "Analysis complete."
): AgentModelSession {
  return {
    modelId: "gpt-5.5",
    reasoningEffort: "medium",
    createPlan: vi.fn(async () => decision),
    createExplanation: vi.fn(async () => ({
      summary,
      highlights: [{ rowIndex: 0, field: "measure_1", label: "Net revenue" }],
      warnings: []
    }))
  };
}

function analysisService(
  plan: ReturnType<typeof analysisPlanSchema.parse>,
  profileColumns: AgentAnalysisStateContract["columns"] = columns
): AnalysisService {
  return {
    loadProfile: vi.fn(async () => ({
      state: "ready" as const,
      context: {
        userId,
        conversationId,
        runId,
        datasetId,
        datasetVersionId,
        datasetName: "Sales",
        originalFilename: "sales.csv",
        columns: profileColumns
      }
    })),
    executePlan: vi.fn(async (input) => ({
      handled: true,
      text: "Deterministic result.",
      analysis: {
        planId: randomUUID(),
        resultId: randomUUID(),
        chartArtifactId: randomUUID(),
        datasetId,
        datasetVersionId,
        plan: input.plan ?? plan,
        planHash: "a".repeat(64),
        schema: [
          { field: "dimension_1", label: "Region", dataType: "category" as const },
          { field: "measure_1", label: "Net revenue", dataType: "number" as const }
        ],
        rows: [{ dimension_1: "North", measure_1: 120 }],
        rowCount: 1,
        truncated: false,
        executionMs: 4,
        checksum: "b".repeat(64),
        provenance: {
          version: 1 as const,
          datasetId,
          datasetVersionId,
          columnIds: [regionId, netRevenueId],
          aggregations: ["sum" as const],
          filters: [],
          timeGrain: null,
          resultRowCount: 1,
          truncated: false,
          assumptions: [],
          warnings: []
        },
        chartSpec: {
          version: 1 as const,
          type: "bar" as const,
          title: "Net revenue by region",
          x: { field: "dimension_1", label: "Region", dataType: "category" as const },
          series: [
            { field: "measure_1", label: "Net revenue", valueFormat: "compact" as const }
          ],
          categoryField: "dimension_1",
          footnotes: []
        },
        createdAt: now
      }
    }))
  } as unknown as AnalysisService;
}

function runInput() {
  return {
    userId,
    conversationId,
    runId,
    userMessageId,
    correlationId,
    content: "Show revenue by region",
    selectedModel: "gpt-5.5",
    selectedReasoningEffort: "medium"
  };
}

function column(
  id: string,
  name: string,
  inferredType: "decimal" | "text",
  semanticType: "numeric" | "categorical"
) {
  return {
    id,
    originalName: name,
    canonicalName: name,
    inferredType,
    semanticType,
    nullable: false
  } as const;
}
