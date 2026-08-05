import { analysisPlanSchema, type AnalysisPlanContract } from "@agentic-csv/contracts";
import type {
  AnalysisColumnMetadata,
  AnalysisPlanner,
  AnalysisPlanningResult
} from "./ports";

export class DeterministicAnalysisPlanner implements AnalysisPlanner {
  public plan(input: {
    readonly question: string;
    readonly columns: readonly AnalysisColumnMetadata[];
  }): AnalysisPlanningResult {
    const question = normalize(input.question);
    const mentioned = findMentionedColumns(question, input.columns);
    const numeric = mentioned.filter(isNumeric);
    const dates = mentioned.filter(isDate);
    const dimensions = mentioned.filter(
      (column) => !isNumeric(column) && !isDate(column)
    );

    if (/\b(correlation|correlate|relationship)\b/.test(question)) {
      const measures = numeric.length >= 2 ? numeric.slice(0, 2) : [];
      if (measures.length !== 2) {
        return unsupported("Name two numeric columns to calculate a correlation.");
      }
      return planned({
        operation: "correlate",
        measures: measures.map((column) => ({
          columnId: column.id,
          aggregation: "value" as const
        })),
        visualizationPreference: "table"
      });
    }

    if (/\b(missing|null|empty values?)\b/.test(question)) {
      const selected = (mentioned.length > 0 ? mentioned : input.columns).slice(0, 16);
      return planned({
        operation: "quality",
        measures: selected.map((column) => ({
          columnId: column.id,
          aggregation: "null_count" as const
        })),
        visualizationPreference: "table"
      });
    }

    if (
      /\b(trend|over time|timeline|monthly|weekly|daily|quarterly|yearly)\b/.test(
        question
      )
    ) {
      const date = dates[0] ?? input.columns.find(isDate);
      if (!date) return unsupported("Name a date column to calculate a trend.");
      const measure = numeric[0];
      return planned({
        operation: "trend",
        dimensions: [{ columnId: date.id }],
        measures: [
          measure
            ? { columnId: measure.id, aggregation: aggregationFromQuestion(question) }
            : { columnId: null, aggregation: "count" }
        ],
        timeGrain: timeGrainFromQuestion(question),
        visualizationPreference: "line"
      });
    }

    if (/\b(distribution|frequency|breakdown)\b/.test(question)) {
      const dimension = dimensions[0] ?? mentioned[0] ?? input.columns.find(isCategory);
      if (!dimension) return unsupported("Name a column to calculate a distribution.");
      return planned({
        operation: "distribution",
        dimensions: [{ columnId: dimension.id }],
        measures: [{ columnId: null, aggregation: "count" }],
        sort: [{ target: "measure", index: 0, direction: "desc" }],
        visualizationPreference: "auto"
      });
    }

    if (/\b(compare|group|by)\b/.test(question)) {
      const dimension = dimensions[0] ?? input.columns.find(isCategory);
      if (!dimension)
        return unsupported("Name a categorical column to group the result.");
      const measure = numeric[0];
      return planned({
        operation: "compare",
        dimensions: [{ columnId: dimension.id }],
        measures: [
          measure
            ? { columnId: measure.id, aggregation: aggregationFromQuestion(question) }
            : { columnId: null, aggregation: "count" }
        ],
        sort: [{ target: "measure", index: 0, direction: "desc" }],
        visualizationPreference: "bar"
      });
    }

    if (/\b(show|list|sample|first)\b.*\b(rows?|records?)\b/.test(question)) {
      const selected = (mentioned.length > 0 ? mentioned : input.columns).slice(0, 8);
      return planned({
        operation: "lookup",
        dimensions: selected.map((column) => ({ columnId: column.id })),
        measures: [],
        limit: 25,
        visualizationPreference: "table"
      });
    }

    if (
      /\b(sum|total|average|avg|mean|minimum|min|maximum|max|count|how many|summarize|summary|overview)\b/.test(
        question
      )
    ) {
      const measure = numeric[0];
      if (/\b(summarize|summary)\b/.test(question) && measure) {
        return planned({
          operation: "aggregate",
          measures: (["count", "sum", "average", "minimum", "maximum"] as const).map(
            (aggregation) => ({ columnId: measure.id, aggregation })
          ),
          visualizationPreference: "table"
        });
      }
      if (/\boverview\b/.test(question) && !measure) {
        return planned({
          operation: "aggregate",
          measures: [{ columnId: null, aggregation: "count" }],
          visualizationPreference: "table"
        });
      }
      if (!measure && !/\b(count|how many)\b/.test(question)) {
        return unsupported("Name a numeric column to calculate that result.");
      }
      return planned({
        operation: "aggregate",
        measures: [
          /\b(count|how many)\b/.test(question)
            ? { columnId: measure?.id ?? null, aggregation: "count" }
            : {
                columnId: measure?.id ?? null,
                aggregation: aggregationFromQuestion(question)
              }
        ],
        visualizationPreference: "table"
      });
    }

    return unsupported(
      "Ask for a total, average, grouped comparison, trend, distribution, correlation, missing-value check, or sample rows."
    );
  }
}

function planned(
  overrides: Partial<AnalysisPlanContract> &
    Pick<AnalysisPlanContract, "operation" | "measures">
): AnalysisPlanningResult {
  return {
    state: "planned",
    plan: analysisPlanSchema.parse({
      version: 1,
      dimensions: [],
      filters: [],
      sort: [],
      limit: 100,
      assumptions: [],
      visualizationPreference: "auto",
      ...overrides
    })
  };
}

function unsupported(message: string): AnalysisPlanningResult {
  return { state: "unsupported", message };
}

function aggregationFromQuestion(
  question: string
): "sum" | "average" | "minimum" | "maximum" | "count" {
  if (/\b(average|avg|mean)\b/.test(question)) return "average";
  if (/\b(minimum|min|lowest)\b/.test(question)) return "minimum";
  if (/\b(maximum|max|highest)\b/.test(question)) return "maximum";
  if (/\b(count|how many)\b/.test(question)) return "count";
  return "sum";
}

function timeGrainFromQuestion(
  question: string
): "day" | "week" | "month" | "quarter" | "year" {
  if (/\b(daily|day)\b/.test(question)) return "day";
  if (/\b(weekly|week)\b/.test(question)) return "week";
  if (/\b(quarterly|quarter)\b/.test(question)) return "quarter";
  if (/\b(yearly|annual|year)\b/.test(question)) return "year";
  return "month";
}

function findMentionedColumns(
  question: string,
  columns: readonly AnalysisColumnMetadata[]
): AnalysisColumnMetadata[] {
  return columns
    .map((column) => ({
      column,
      position: Math.min(
        matchPosition(question, normalize(column.originalName)),
        matchPosition(question, normalize(column.canonicalName))
      )
    }))
    .filter((match) => Number.isFinite(match.position))
    .sort((left, right) => left.position - right.position)
    .map((match) => match.column);
}

function matchPosition(question: string, column: string): number {
  if (!column) return Number.POSITIVE_INFINITY;
  const position = question.indexOf(column);
  return position < 0 ? Number.POSITIVE_INFINITY : position;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isNumeric(column: AnalysisColumnMetadata): boolean {
  return column.inferredType === "integer" || column.inferredType === "decimal";
}

function isDate(column: AnalysisColumnMetadata): boolean {
  return column.inferredType === "date" || column.inferredType === "timestamp";
}

function isCategory(column: AnalysisColumnMetadata): boolean {
  return column.semanticType === "categorical" || column.semanticType === "identifier";
}
