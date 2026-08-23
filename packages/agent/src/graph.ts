import { END, START, StateGraph } from "@langchain/langgraph";
import {
  AgentError,
  type AgentCheckpointRepository,
  type AgentModelSession,
  type AgentProviderService,
  type AnalysisService,
  type CompletedAnalysis,
  type ConversationRepository,
  type ConversationResponder,
  type ConversationResponderResult,
  type SemanticMemoryRetriever
} from "@agentic-csv/application";
import {
  agentAnalysisStateSchema,
  agentClarificationSchema,
  agentPlanningDecisionSchema,
  chartFieldsMatchResult,
  type AgentAnalysisStateContract,
  type AgentClarificationContract,
  type AgentPlanningDecisionDraftContract,
  type AgentProgressStage,
  type AnalysisPlanContract
} from "@agentic-csv/contracts";
import { createUuidV7 } from "@agentic-csv/domain";
import { AnalysisStateAnnotation, type AnalysisRuntimeState } from "./state";

const REVENUE_DEFINITION_QUESTION =
  "Which revenue definition should be used for this analysis?";

export interface AgentGraphPolicy {
  readonly maxSteps: number;
  readonly maxRepairs: number;
  readonly maxToolCalls: number;
  readonly maxResultRowsToModel: number;
}

interface GraphDependencies {
  readonly analysis: AnalysisService;
  readonly conversations: ConversationRepository;
  readonly model: AgentModelSession;
  readonly memory: SemanticMemoryRetriever;
  readonly policy: AgentGraphPolicy;
  readonly now: () => Date;
  readonly createId: () => string;
}

export class LangGraphConversationResponder implements ConversationResponder {
  public constructor(
    private readonly analysis: AnalysisService,
    private readonly provider: AgentProviderService,
    private readonly checkpoints: AgentCheckpointRepository,
    private readonly conversations: ConversationRepository,
    private readonly policy: AgentGraphPolicy,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = createUuidV7,
    private readonly memory: SemanticMemoryRetriever = emptyMemoryRetriever
  ) {}

  public async respond(
    input: Parameters<ConversationResponder["respond"]>[0]
  ): Promise<ConversationResponderResult> {
    const stored = await this.checkpoints.load(input);
    return this.provider.withSession(
      input.userId,
      {
        modelId: stored?.state.selectedModel ?? input.selectedModel,
        reasoningEffort:
          stored?.state.selectedReasoningEffort ?? input.selectedReasoningEffort
      },
      async (model) => {
        const initial = runtimeState(
          stored?.state ?? initialSnapshot(input, model, this.now().toISOString())
        );
        let revision = stored?.revision ?? null;
        const dependencies: GraphDependencies = {
          analysis: this.analysis,
          conversations: this.conversations,
          model,
          memory: this.memory,
          policy: this.policy,
          now: this.now,
          createId: this.createId
        };
        const persist = async (state: AnalysisRuntimeState): Promise<void> => {
          const saved = await this.checkpoints.save({
            state: agentAnalysisStateSchema.parse(state.snapshot),
            expectedRevision: revision
          });
          revision = saved.revision;
        };
        const graph = createAnalysisGraph(dependencies, persist);
        const result = await graph.invoke(
          { value: initial },
          {
            recursionLimit: Math.max(this.policy.maxSteps + this.policy.maxRepairs + 4, 8)
          }
        );
        const state = result.value;
        const metrics = {
          stepCount: state.snapshot.stepCount,
          repairCount: state.snapshot.repairCount,
          toolCallCount: state.snapshot.toolCallCount
        };
        if (state.outcome === "waiting_for_user" && state.snapshot.clarification) {
          return {
            state: "waiting_for_user",
            clarification: state.snapshot.clarification,
            checkpoint: state.snapshot,
            metrics
          };
        }
        if (!state.finalText) {
          throw new AgentError(
            "AGENT_CHECKPOINT_INVALID",
            "The analytical run did not produce a valid response."
          );
        }
        return {
          state: "completed",
          text: state.finalText,
          ...(state.analysis ? { analysis: state.analysis } : {}),
          metrics
        };
      }
    );
  }
}

function createAnalysisGraph(
  dependencies: GraphDependencies,
  persist: (state: AnalysisRuntimeState) => Promise<void>
) {
  const node =
    (
      stage: AgentProgressStage,
      message: string,
      work: (state: AnalysisRuntimeState) => Promise<AnalysisRuntimeState>,
      toolCalls: number | ((state: AnalysisRuntimeState) => number) = 0
    ) =>
    async ({ value }: { value: AnalysisRuntimeState }) => {
      await assertActive(value, dependencies);
      const nextStep = value.snapshot.stepCount + 1;
      const toolCallIncrement =
        typeof toolCalls === "function" ? toolCalls(value) : toolCalls;
      const nextTools = value.snapshot.toolCallCount + toolCallIncrement;
      if (
        nextStep > dependencies.policy.maxSteps ||
        nextTools > dependencies.policy.maxToolCalls
      ) {
        throw new AgentError(
          "AGENT_LIMIT_EXCEEDED",
          "The analysis stopped after reaching its configured execution limit."
        );
      }
      const progressed = withSnapshot(value, {
        stepCount: nextStep,
        toolCallCount: nextTools,
        updatedAt: dependencies.now().toISOString()
      });
      const allowed = await dependencies.conversations.recordRunProgress({
        userId: progressed.snapshot.userId,
        conversationId: progressed.snapshot.conversationId,
        runId: progressed.snapshot.runId,
        stage,
        message,
        stepCount: nextStep,
        repairCount: progressed.snapshot.repairCount,
        toolCallCount: nextTools,
        occurredAt: dependencies.now()
      });
      if (!allowed) throw cancelled();
      const completed = await work(progressed);
      await persist(completed);
      return { value: completed };
    };

  const authorize = node(
    "authorizing",
    "Loading the authorized dataset profile",
    async (state) => {
      const loaded = await dependencies.analysis.loadProfile(state.snapshot);
      if (loaded.state === "no_dataset") {
        throw new AgentError(
          "AGENT_DATASET_NOT_READY",
          "Attach a CSV before starting data-backed analysis."
        );
      }
      if (loaded.state === "not_ready") {
        throw new AgentError(
          "AGENT_DATASET_NOT_READY",
          `${loaded.originalFilename} is still ${loaded.status.replaceAll("_", " ")}.`
        );
      }
      return withSnapshot(state, {
        datasetId: loaded.context.datasetId,
        datasetVersionId: loaded.context.datasetVersionId,
        datasetName: loaded.context.datasetName,
        originalFilename: loaded.context.originalFilename,
        columns: [...loaded.context.columns]
      });
    },
    1
  );

  const classifyIntent = node(
    "planning",
    "Classifying the analytical request",
    async (state) =>
      withSnapshot(state, { intent: classifyIntentLocally(state.snapshot.question) })
  );

  const retrieveContext = node(
    "planning",
    "Preparing bounded analytical context",
    async (state) => {
      if (state.snapshot.intent === "conversation_history") {
        return withSnapshot(state, { retrievedContext: [] });
      }
      if (!state.snapshot.datasetId || !state.snapshot.datasetVersionId) {
        throw new AgentError(
          "AGENT_CHECKPOINT_INVALID",
          "The authorized dataset context is missing."
        );
      }
      const context = await dependencies.memory.retrieve({
        userId: state.snapshot.userId,
        conversationId: state.snapshot.conversationId,
        datasetId: state.snapshot.datasetId,
        datasetVersionId: state.snapshot.datasetVersionId,
        question: state.snapshot.question
      });
      return withSnapshot(state, { retrievedContext: [...context.items] });
    },
    (state) => (state.snapshot.intent === "conversation_history" ? 0 : 1)
  );

  const createPlan = node(
    "planning",
    "Creating a structured analysis plan",
    async (state) => {
      const ambiguity = localMaterialAmbiguity(state.snapshot, dependencies.createId);
      if (ambiguity) {
        return {
          ...state,
          outcome: "waiting_for_user" as const,
          snapshot: agentAnalysisStateSchema.parse({
            ...state.snapshot,
            phase: "waiting_for_user",
            clarification: ambiguity,
            plan: null,
            updatedAt: dependencies.now().toISOString()
          })
        };
      }
      const decision = await dependencies.model.createPlan({
        question: state.snapshot.question,
        columns: state.snapshot.columns,
        conversationHistory: state.snapshot.conversationHistory,
        retrievedContext: state.snapshot.retrievedContext,
        clarification: state.snapshot.clarification,
        validationErrors: state.snapshot.validationErrors
      });
      return {
        ...state,
        decision,
        snapshot: agentAnalysisStateSchema.parse({
          ...state.snapshot,
          intent: decision.intent,
          plan: null,
          assumptions: decision.assumptions,
          validationErrors: [],
          updatedAt: dependencies.now().toISOString()
        })
      };
    }
  );

  const validatePlan = node(
    "validating",
    "Validating the structured analysis plan",
    async (state) => {
      if (state.outcome === "waiting_for_user") return state;
      const decision = state.decision;
      if (!decision)
        return repairState(state, ["The provider did not return a planning decision."]);
      const parsedDecision = agentPlanningDecisionSchema.safeParse(decision);
      if (!parsedDecision.success) {
        return repairState(state, planningValidationErrors(parsedDecision.error.issues));
      }
      const validatedDecision = parsedDecision.data;
      if (validatedDecision.intent === "conversation_history") {
        if (!validatedDecision.directResponse) {
          return repairState(state, [
            "A conversation history request requires a grounded direct response."
          ]);
        }
        return {
          ...state,
          outcome: "direct_response" as const,
          finalText: validatedDecision.directResponse
        };
      }
      if (validatedDecision.intent === "unsupported") {
        if (isExecutableAnalyticalRequest(state.snapshot.question)) {
          return repairState(state, [
            "This is an executable dataset-analysis request. If a requested concept does not match a supplied column, return a clarification with compatible supplied-column options instead of marking it unsupported."
          ]);
        }
        return {
          ...state,
          outcome: "unsupported" as const,
          finalText:
            validatedDecision.directResponse ??
            "This request is outside the available bounded analytical operations."
        };
      }
      const ambiguity = providerAmbiguity(
        state.snapshot,
        validatedDecision,
        dependencies.createId
      );
      if (ambiguity) {
        return {
          ...state,
          outcome: "waiting_for_user" as const,
          snapshot: agentAnalysisStateSchema.parse({
            ...state.snapshot,
            phase: "waiting_for_user",
            clarification: ambiguity,
            plan: null,
            updatedAt: dependencies.now().toISOString()
          })
        };
      }
      if (!validatedDecision.plan)
        return repairState(state, ["The provider did not return an analysis plan."]);
      const errors = validatePlanColumns(validatedDecision.plan, state.snapshot);
      if (errors.length > 0) return repairState(state, errors);
      return {
        ...state,
        outcome: "continue" as const,
        snapshot: agentAnalysisStateSchema.parse({
          ...state.snapshot,
          plan: validatedDecision.plan,
          assumptions: validatedDecision.assumptions,
          validationErrors: [],
          updatedAt: dependencies.now().toISOString()
        })
      };
    }
  );

  const repairPlan = node(
    "planning",
    "Repairing the structured analysis plan",
    async (state) => {
      if (state.snapshot.repairCount >= dependencies.policy.maxRepairs) {
        throw new AgentError(
          "ANALYSIS_PLAN_UNRESOLVED",
          "The analysis plan could not be validated within the configured repair limit."
        );
      }
      const repaired = withSnapshot(state, {
        repairCount: state.snapshot.repairCount + 1
      });
      const decision = await dependencies.model.createPlan({
        question: repaired.snapshot.question,
        columns: repaired.snapshot.columns,
        conversationHistory: repaired.snapshot.conversationHistory,
        retrievedContext: repaired.snapshot.retrievedContext,
        clarification: repaired.snapshot.clarification,
        validationErrors: repaired.snapshot.validationErrors
      });
      return {
        ...repaired,
        decision,
        snapshot: agentAnalysisStateSchema.parse({
          ...repaired.snapshot,
          intent: decision.intent,
          plan: null,
          assumptions: decision.assumptions,
          updatedAt: dependencies.now().toISOString()
        })
      };
    }
  );

  const clarificationInterrupt = node(
    "validating",
    "Waiting for a clarification",
    async (state) => state
  );

  const compilePlan = node(
    "validating",
    "Compiling the validated analysis plan",
    async (state) => {
      if (!state.snapshot.plan) {
        throw new AgentError(
          "ANALYSIS_PLAN_UNRESOLVED",
          "A validated analysis plan is required."
        );
      }
      return state;
    }
  );

  const executeAnalysis = node(
    "analyzing",
    "Running the bounded deterministic analysis",
    async (state) => {
      if (!state.snapshot.plan) {
        throw new AgentError(
          "ANALYSIS_PLAN_UNRESOLVED",
          "A validated analysis plan is required."
        );
      }
      const executed = await dependencies.analysis.executePlan({
        userId: state.snapshot.userId,
        conversationId: state.snapshot.conversationId,
        runId: state.snapshot.runId,
        question: state.snapshot.question,
        plan: state.snapshot.plan
      });
      if (!executed.handled || !executed.analysis) {
        throw new AgentError(
          "AGENT_DATASET_NOT_READY",
          "The active dataset is not ready for analysis."
        );
      }
      return { ...state, analysis: executed.analysis };
    },
    1
  );

  const verifyResult = node(
    "verifying",
    "Verifying the calculated result",
    async (state) => {
      if (!state.analysis || !state.snapshot.plan) {
        throw new AgentError(
          "AGENT_CHECKPOINT_INVALID",
          "The analytical result is missing."
        );
      }
      if (
        state.analysis.planHash.length !== 64 ||
        !chartFieldsMatchResult(state.analysis.chartSpec, {
          schema: [...state.analysis.schema]
        })
      ) {
        throw new AgentError(
          "AGENT_CHECKPOINT_INVALID",
          "The analytical result failed deterministic verification."
        );
      }
      return state;
    }
  );

  const selectVisualization = node(
    "verifying",
    "Validating the visualization",
    async (state) => state
  );

  const generateExplanation = node(
    "explaining",
    "Explaining the verified result",
    async (state) => {
      const analysis = requireAnalysis(state);
      const plan = state.snapshot.plan;
      if (!plan)
        throw new AgentError("AGENT_CHECKPOINT_INVALID", "The analysis plan is missing.");
      try {
        const explanation = await dependencies.model.createExplanation({
          question: state.snapshot.question,
          plan,
          schema: analysis.schema,
          rows: analysis.rows.slice(0, dependencies.policy.maxResultRowsToModel),
          rowCount: analysis.rowCount,
          truncated: analysis.truncated,
          assumptions: analysis.provenance.assumptions,
          warnings: analysis.provenance.warnings
        });
        return {
          ...state,
          explanation,
          finalText: discloseAppliedMemory(
            materializeExplanation(explanation, analysis),
            state.snapshot
          )
        };
      } catch (error) {
        if (
          !(error instanceof AgentError) ||
          error.code !== "AGENT_PROVIDER_OUTPUT_INVALID"
        ) {
          throw error;
        }
        return {
          ...state,
          finalText: discloseAppliedMemory(
            "The verified analysis completed, but OpenAI could not format the explanation. Review the result and chart below.",
            state.snapshot
          ),
          snapshot: agentAnalysisStateSchema.parse({
            ...state.snapshot,
            warnings: [
              ...state.snapshot.warnings,
              "The provider explanation was unavailable; the verified result is unchanged."
            ].slice(0, 32),
            updatedAt: dependencies.now().toISOString()
          })
        };
      }
    }
  );

  const persistOutput = node(
    "verifying",
    "Finalizing the analytical response",
    async (state) => ({
      ...state,
      outcome: "completed" as const
    })
  );

  return new StateGraph(AnalysisStateAnnotation)
    .addNode("authorize_and_load_context", authorize)
    .addNode("classify_intent", classifyIntent)
    .addNode("retrieve_semantic_context", retrieveContext)
    .addNode("create_analysis_plan", createPlan)
    .addNode("validate_plan", validatePlan)
    .addNode("repair_plan", repairPlan)
    .addNode("clarification_interrupt", clarificationInterrupt)
    .addNode("compile_query", compilePlan)
    .addNode("execute_analysis", executeAnalysis)
    .addNode("verify_result", verifyResult)
    .addNode("select_visualization", selectVisualization)
    .addNode("generate_explanation", generateExplanation)
    .addNode("persist_output", persistOutput)
    .addEdge(START, "authorize_and_load_context")
    .addEdge("authorize_and_load_context", "classify_intent")
    .addEdge("classify_intent", "retrieve_semantic_context")
    .addEdge("retrieve_semantic_context", "create_analysis_plan")
    .addEdge("create_analysis_plan", "validate_plan")
    .addConditionalEdges("validate_plan", ({ value }) => validationRoute(value), [
      "repair_plan",
      "clarification_interrupt",
      "compile_query",
      "persist_output"
    ])
    .addEdge("repair_plan", "validate_plan")
    .addEdge("clarification_interrupt", END)
    .addEdge("compile_query", "execute_analysis")
    .addEdge("execute_analysis", "verify_result")
    .addEdge("verify_result", "select_visualization")
    .addEdge("select_visualization", "generate_explanation")
    .addEdge("generate_explanation", "persist_output")
    .addEdge("persist_output", END)
    .compile();
}

function runtimeState(snapshot: AgentAnalysisStateContract): AnalysisRuntimeState {
  return {
    snapshot,
    decision: null,
    analysis: null,
    explanation: null,
    finalText: null,
    outcome: "continue"
  };
}

function initialSnapshot(
  input: Parameters<ConversationResponder["respond"]>[0],
  model: AgentModelSession,
  updatedAt: string
): AgentAnalysisStateContract {
  return agentAnalysisStateSchema.parse({
    version: 1,
    correlationId: input.correlationId,
    runId: input.runId,
    conversationId: input.conversationId,
    userId: input.userId,
    userMessageId: input.userMessageId,
    question: input.content,
    phase: "initial",
    datasetId: null,
    datasetVersionId: null,
    datasetName: null,
    originalFilename: null,
    columns: [],
    conversationHistory: [...input.conversationHistory],
    retrievedContext: [],
    intent: null,
    plan: null,
    clarification: null,
    assumptions: [],
    warnings: [],
    errors: [],
    validationErrors: [],
    selectedModel: model.modelId,
    selectedReasoningEffort: model.reasoningEffort,
    stepCount: 0,
    repairCount: 0,
    toolCallCount: 0,
    updatedAt
  });
}

function withSnapshot(
  state: AnalysisRuntimeState,
  update: Partial<AgentAnalysisStateContract>
): AnalysisRuntimeState {
  return {
    ...state,
    snapshot: agentAnalysisStateSchema.parse({ ...state.snapshot, ...update })
  };
}

function repairState(
  state: AnalysisRuntimeState,
  validationErrors: readonly string[]
): AnalysisRuntimeState {
  return withSnapshot(state, { validationErrors: [...validationErrors] });
}

function planningValidationErrors(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]
): string[] {
  return issues.slice(0, 16).map((issue) => {
    const path = issue.path
      .filter(
        (part): part is string | number =>
          typeof part === "string" || typeof part === "number"
      )
      .join(".");
    return `${path || "decision"}: ${issue.message}`.slice(0, 500);
  });
}

function validationRoute(state: AnalysisRuntimeState) {
  if (state.outcome === "waiting_for_user") return "clarification_interrupt" as const;
  if (["direct_response", "unsupported"].includes(state.outcome))
    return "persist_output" as const;
  if (state.snapshot.validationErrors.length > 0) return "repair_plan" as const;
  return "compile_query" as const;
}

async function assertActive(
  state: AnalysisRuntimeState,
  dependencies: GraphDependencies
): Promise<void> {
  if (
    await dependencies.conversations.isRunCancelled({
      userId: state.snapshot.userId,
      conversationId: state.snapshot.conversationId,
      runId: state.snapshot.runId
    })
  ) {
    throw cancelled();
  }
}

function cancelled(): AgentError {
  return new AgentError("AGENT_CANCELLED", "The analytical run was cancelled.");
}

function localMaterialAmbiguity(
  snapshot: AgentAnalysisStateContract,
  createId: () => string
): AgentClarificationContract | null {
  const existing = snapshot.clarification;
  if (existing?.status === "answered" && existing.answer) return null;
  const question = normalize(snapshot.question);
  if (rememberedDefinition(snapshot, "revenue")) return null;
  const revenueColumns = snapshot.columns.filter((column) =>
    normalize(column.canonicalName).includes("revenue")
  );
  const namesExact = revenueColumns.some((column) =>
    question.includes(normalize(column.canonicalName))
  );
  if (question.includes("revenue") && revenueColumns.length > 1 && !namesExact) {
    return agentClarificationSchema.parse({
      id: existing?.id ?? createId(),
      question: REVENUE_DEFINITION_QUESTION,
      options: revenueColumns.slice(0, 8).map((column) => ({
        value: column.canonicalName,
        label: humanize(column.originalName),
        columnId: column.id
      })),
      status: "pending",
      answer: null
    });
  }
  return null;
}

function providerAmbiguity(
  snapshot: AgentAnalysisStateContract,
  decision: AgentPlanningDecisionDraftContract,
  createId: () => string
): AgentClarificationContract | null {
  const existing = snapshot.clarification;
  if (existing?.status === "answered" && existing.answer) return null;
  if (decision.requiresClarification) {
    return agentClarificationSchema.parse({
      id: existing?.id ?? createId(),
      question: decision.clarificationQuestion,
      options: decision.clarificationOptions.filter(
        (option) =>
          option.columnId === null ||
          snapshot.columns.some((column) => column.id === option.columnId)
      ),
      status: "pending",
      answer: null
    });
  }
  return null;
}

function validatePlanColumns(
  plan: AnalysisPlanContract,
  snapshot: AgentAnalysisStateContract
): string[] {
  const known = new Map(snapshot.columns.map((column) => [column.id, column]));
  const referenced = [
    ...plan.dimensions.map((reference) => reference.columnId),
    ...plan.measures.flatMap((measure) => (measure.columnId ? [measure.columnId] : [])),
    ...plan.filters.map((filter) => filter.columnId)
  ];
  const errors: string[] = [];
  for (const id of new Set(referenced)) {
    if (!known.has(id))
      errors.push(`Column ${id} does not belong to the active dataset version.`);
  }
  for (const item of snapshot.retrievedContext) {
    const definition = item.definition;
    if (!definition || !questionMentions(snapshot.question, definition.alias)) continue;
    if (!plan.measures.some((measure) => measure.columnId === definition.columnId)) {
      errors.push(
        `The plan must use confirmed definition ${definition.alias} = ${definition.columnName} (${definition.columnId}).`
      );
    }
  }
  const answered = snapshot.clarification;
  if (answered?.status === "answered" && answered.answer) {
    const selected = answered.options.find((option) => {
      const answer = normalize(answered.answer!);
      return (
        normalize(option.value) === answer || answer.includes(normalize(option.label))
      );
    });
    if (selected?.columnId) {
      const selectedColumnUsed =
        answered.question === REVENUE_DEFINITION_QUESTION
          ? plan.measures.some((measure) => measure.columnId === selected.columnId)
          : referenced.includes(selected.columnId);
      if (!selectedColumnUsed) {
        errors.push(
          answered.question === REVENUE_DEFINITION_QUESTION
            ? "The repaired plan does not use the revenue measure selected by the user."
            : "The repaired plan does not use the column selected by the user."
        );
      }
    }
  }
  return errors.slice(0, 16);
}

function discloseAppliedMemory(
  text: string,
  snapshot: AgentAnalysisStateContract
): string {
  const disclosures = snapshot.retrievedContext.flatMap((item) => {
    const definition = item.definition;
    if (!definition || !questionMentions(snapshot.question, definition.alias)) return [];
    return [
      `Remembered definition applied: ${definition.alias} means ${definition.columnName}.`
    ];
  });
  return [...new Set(disclosures), text].join("\n\n").slice(0, 16_000);
}

function rememberedDefinition(snapshot: AgentAnalysisStateContract, alias: string) {
  return snapshot.retrievedContext.find(
    (item) =>
      item.definition &&
      normalize(item.definition.alias) === normalize(alias) &&
      snapshot.columns.some((column) => column.id === item.definition?.columnId)
  );
}

function questionMentions(question: string, alias: string): boolean {
  return ` ${normalize(question)} `.includes(` ${normalize(alias)} `);
}

const emptyMemoryRetriever: SemanticMemoryRetriever = {
  retrieve: async () => ({ version: 1, revision: 0, items: [] })
};

function requireAnalysis(state: AnalysisRuntimeState): CompletedAnalysis {
  if (!state.analysis) {
    throw new AgentError("AGENT_CHECKPOINT_INVALID", "The analytical result is missing.");
  }
  return state.analysis;
}

function materializeExplanation(
  explanation: NonNullable<AnalysisRuntimeState["explanation"]>,
  analysis: CompletedAnalysis
): string {
  const summary = hasNumericClaim(explanation.summary)
    ? "The requested analysis completed successfully."
    : explanation.summary;
  const schema = new Map(analysis.schema.map((column) => [column.field, column]));
  const highlights = explanation.highlights.flatMap((highlight) => {
    const row = analysis.rows[highlight.rowIndex];
    const column = schema.get(highlight.field);
    if (!row || !column || !(highlight.field in row)) return [];
    return [`${highlight.label}: ${formatValue(row[highlight.field])}.`];
  });
  const warnings = [...analysis.provenance.warnings, ...explanation.warnings]
    .slice(0, 4)
    .map((warning) => `Warning: ${warning}`);
  return [summary, ...highlights, ...warnings].join("\n\n").slice(0, 16_000);
}

function hasNumericClaim(text: string): boolean {
  return /-?\d[\d,]*(?:\.\d+)?/.test(text);
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
  }
  if (value === null || value === undefined) return "no value";
  return String(value).slice(0, 500);
}

function classifyIntentLocally(question: string): AgentAnalysisStateContract["intent"] {
  const normalized = normalize(question);
  if (
    /\b(previous|previously|earlier|prior|before|history|recap|recall|last (?:thing|request|analysis|result))\b/.test(
      normalized
    )
  ) {
    return "conversation_history";
  }
  if (/correlat|relationship/.test(normalized)) return "correlation";
  if (/trend|over time|monthly|weekly|yearly/.test(normalized)) return "trend";
  if (/missing|null|quality/.test(normalized)) return "data_quality";
  if (/distribution|frequency|breakdown/.test(normalized)) return "distribution";
  if (/compare| by /.test(` ${normalized} `)) return "comparison";
  if (/sum|total|average|count|minimum|maximum/.test(normalized)) return "aggregation";
  return "dataset_overview";
}

function isExecutableAnalyticalRequest(question: string): boolean {
  const normalized = normalize(question);
  const visualizationMentioned = /\b(charts?|graphs?|plots?|visualizations?)\b/.test(
    normalized
  );
  const asksAboutCapabilities =
    visualizationMentioned &&
    /\b(what|which|available|supported|types?|kinds?|can you|do you)\b/.test(normalized);
  if (asksAboutCapabilities) return false;

  return /\b(build|create|make|generate|show|display|plot|chart|graph|visualize|analyse|analyze|compare|trend|distribution|breakdown|correlate|correlation|count|how many|sum|total|average|minimum|maximum|missing|null|quality|find|lookup)\b/.test(
    normalized
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
