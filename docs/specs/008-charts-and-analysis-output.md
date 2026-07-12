# 008 — Charts and Analytical Output

**Status:** Approved for implementation

## 1. Output composition

A successful analytical assistant response may include:

- concise textual answer
- validated chart artifact
- optional compact table
- assumptions
- filters and aggregations
- source columns and dataset version
- warnings
- collapsible query/provenance details
- follow-up suggestions

## 2. Chart contract

The LLM returns a `ChartSpec`; it never returns JSX or arbitrary Recharts code.

```ts
type ChartSpec = {
  version: 1;
  type: "bar" | "line" | "pie" | "scatter" | "table";
  title: string;
  description?: string;
  x?: {
    field: string;
    label: string;
    dataType: "category" | "number" | "date";
  };
  series: Array<{
    field: string;
    label: string;
    valueFormat?: "raw" | "integer" | "compact" | "currency" | "percent";
    currency?: string;
  }>;
  categoryField?: string;
  sort?: { field: string; direction: "asc" | "desc" };
  footnotes: string[];
};
```

A deterministic validator confirms every referenced field exists in the stored result artifact.

## 3. Selection rules

- **Line:** ordered time series or progression.
- **Bar:** categorical comparison/ranking.
- **Pie:** one part-to-whole result with few categories and a meaningful total.
- **Scatter:** relationship between two numeric variables.
- **Table:** detailed output, many categories, or no honest visual mapping.

Prefer table over a misleading chart. Cap visible categories and expose truncation.

## 4. Analytical execution

Preferred MVP:

- compile structured plan to parameterized/quoted DuckDB SQL;
- use an allow-listed compiler rather than executing model-written SQL;
- permit only active authorized dataset relations;
- no `ATTACH`, `INSTALL`, `LOAD`, shell, network or arbitrary file functions;
- enforce row, time and memory limits.

If a future advanced mode accepts generated SQL, it requires an ADR, SQL AST validation and equivalent controls.

## 5. Result artifact

Store results separately from message text:

```ts
type AnalysisResultArtifact = {
  id: string;
  userId: string;
  datasetVersionId: string;
  planHash: string;
  schema: ResultColumn[];
  rows: Record<string, JsonValue>[];
  rowCount: number;
  truncated: boolean;
  executionMs: number;
  createdAt: string;
};
```

Large results must be stored in object storage or a bounded table rather than bloating the message record.

## 6. Provenance

Every answer references:

- dataset and version
- columns used
- aggregation functions
- filters
- date grain/range
- number of result rows
- whether data was truncated
- assumptions and warnings

Raw internal chain-of-thought is not stored or exposed. Store plan summaries, tool events and provider-approved reasoning summaries only when explicitly enabled.

## 7. Empty and error states

- No rows: say that filters returned no matching data; do not render a zero-valued chart as if data existed.
- Invalid type: ask clarification or explain the incompatible column.
- Too many categories: select top N, group remaining as “Other” only when mathematically valid, and disclose it.
- Query timeout: provide a retryable error and a narrower-question suggestion.

## 8. Acceptance scenarios

```gherkin
Scenario: line chart for monthly trend
  Given a result contains ordered month and revenue fields
  When visualization is automatic
  Then a line ChartSpec is produced
  And both fields are validated against the result schema

Scenario: model references missing field
  Given a ChartSpec references profit_margin not present in the result
  When chart validation runs
  Then the chart is rejected
  And the graph repairs the chart or returns a table
```
