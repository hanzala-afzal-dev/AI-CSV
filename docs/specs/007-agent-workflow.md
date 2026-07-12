# 007 — LangGraph Agent Workflow

**Status:** Approved for implementation

## 1. Goal

Implement one explicit, stateful analytical graph. Do not introduce a multi-agent swarm.

## 2. State

```ts
type CsvAnalystState = {
  runId: string;
  conversationId: string;
  userId: string;
  datasetId: string;
  datasetVersionId: string;
  userMessageId: string;
  question: string;

  datasetProfile?: DatasetProfile;
  retrievedContext: RetrievedContext[];
  intent?: QueryIntent;
  plan?: AnalysisPlan;
  clarification?: ClarificationState;
  query?: CompiledQuery;
  result?: AnalysisResult;
  chartSpec?: ChartSpec;
  suggestions: SuggestedPrompt[];

  assumptions: string[];
  warnings: string[];
  errors: AgentError[];
  stepCount: number;
  repairCount: number;
};
```

`userId` is injected by the trusted application layer and cannot be changed by model output.

## 3. Graph

```text
START
  -> authorize_and_load_context
  -> classify_intent
  -> retrieve_semantic_context
  -> create_analysis_plan
  -> validate_plan
       -> clarification_interrupt (when material ambiguity exists)
       -> compile_query
  -> validate_query
  -> execute_analysis
  -> verify_result
       -> repair_plan (bounded)
       -> select_visualization
  -> generate_explanation
  -> generate_follow_up_suggestions
  -> persist_output
  -> END
```

## 4. Intent types

- dataset_overview
- schema_question
- aggregation
- comparison
- trend
- distribution
- correlation
- data_quality
- textual_search
- clarification_answer
- unsupported

## 5. Analysis plan

Prefer model-generated structured plans and deterministic query compilation over unrestricted raw SQL generation.

```ts
type AnalysisPlan = {
  operation:
    | "aggregate"
    | "compare"
    | "trend"
    | "distribution"
    | "correlate"
    | "quality"
    | "lookup";
  dimensions: ColumnRef[];
  measures: MeasureSpec[];
  filters: FilterSpec[];
  timeGrain?: "day" | "week" | "month" | "quarter" | "year";
  sort?: SortSpec[];
  limit?: number;
  visualizationPreference?: ChartType | "auto" | "none";
  requiresClarification: boolean;
  clarificationQuestion?: string;
  assumptions: string[];
};
```

Column references must resolve against the active version's canonical schema.

## 6. Clarification rules

Ask before execution when:

- a requested measure maps plausibly to multiple columns;
- “growth” lacks baseline/metric definition;
- date range or date column materially changes the result;
- the user says “best”, “performance” or similar without a measurable definition;
- requested chart conflicts with data shape in a way that changes interpretation;
- the user references a column/entity not resolvable from schema, glossary or conversation.

Do not ask when a safe conventional interpretation is clearly available and disclosed as an assumption.

## 7. Tools

Required narrow tools:

- `get_dataset_profile`
- `get_column_profile`
- `sample_authorized_rows`
- `search_dataset_context`
- `compile_analysis_plan`
- `execute_readonly_analysis`
- `calculate_correlation`
- `validate_analysis_result`
- `persist_chart_artifact`

Tool input schemas include resource IDs but tools independently enforce the trusted actor context.

## 8. Limits

- Maximum graph steps: configurable, default 20.
- Maximum plan repairs: default 2.
- Maximum tool calls: default 12.
- Maximum query rows returned to model: default 200; larger result sets are summarized deterministically.
- Maximum execution time and memory per DuckDB query.
- Cancellation checked between nodes and during supported operations.

## 9. Provider context

Use the user's selected provider model and reasoning effort. Conversation/provider state must not cross user boundaries. Provider failures become typed run failures and never cause fallback to another user's or a global secret.

## 10. Verification

Before final answer:

- Ensure result columns match the plan.
- Verify totals/row counts where feasible.
- Confirm chart fields exist in result data.
- Ensure explanation numbers are serialized from the result, not independently invented.
- Mark empty results explicitly.
- Include warnings for high null ratios or inferred types when relevant.

## 11. Acceptance scenarios

```gherkin
Scenario: ambiguity causes interrupt
  Given a dataset has gross_revenue and net_revenue
  When the user asks "show revenue by month"
  Then the graph persists a clarification interrupt
  And asks which revenue definition to use
  And does not execute an aggregation first

Scenario: clarification resumes
  Given the graph is waiting for the revenue definition
  When the user replies "net revenue"
  Then the same run resumes with net_revenue
  And produces a verified result

Scenario: tool-call bound
  Given repeated invalid plans
  When the maximum repair count is reached
  Then the run fails safely with ANALYSIS_PLAN_UNRESOLVED
  And does not loop indefinitely
```
