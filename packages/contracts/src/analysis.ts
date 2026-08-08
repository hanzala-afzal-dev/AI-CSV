import { z } from "zod";

export const analysisOperationSchema = z.enum([
  "aggregate",
  "compare",
  "trend",
  "distribution",
  "correlate",
  "quality",
  "lookup"
]);

export const analysisAggregationSchema = z.enum([
  "value",
  "count",
  "count_distinct",
  "sum",
  "average",
  "minimum",
  "maximum",
  "null_count"
]);

export const analysisColumnRefSchema = z.object({ columnId: z.string().uuid() }).strict();

export const analysisMeasureSchema = z
  .object({
    columnId: z.string().uuid().nullable(),
    aggregation: analysisAggregationSchema
  })
  .strict();

const analysisFilterValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean()
]);

const comparisonFilterSchema = z
  .object({
    columnId: z.string().uuid(),
    operator: z.enum(["eq", "not_eq", "gt", "gte", "lt", "lte", "contains"]),
    value: analysisFilterValueSchema
  })
  .strict();

const nullFilterSchema = z
  .object({
    columnId: z.string().uuid(),
    operator: z.enum(["is_null", "not_null"])
  })
  .strict();

export const analysisFilterSchema = z.union([comparisonFilterSchema, nullFilterSchema]);

export const analysisSortSchema = z
  .object({
    target: z.enum(["dimension", "measure"]),
    index: z.number().int().min(0).max(15),
    direction: z.enum(["asc", "desc"])
  })
  .strict();

export const analysisTimeGrainSchema = z.enum([
  "day",
  "week",
  "month",
  "quarter",
  "year"
]);

export const analysisVisualizationPreferenceSchema = z.enum([
  "auto",
  "none",
  "table",
  "bar",
  "line",
  "pie",
  "scatter"
]);

export const analysisPlanDraftSchema = z
  .object({
    version: z.literal(1),
    operation: analysisOperationSchema,
    dimensions: z.array(analysisColumnRefSchema).max(8),
    measures: z.array(analysisMeasureSchema).max(16),
    filters: z.array(analysisFilterSchema).max(16),
    timeGrain: analysisTimeGrainSchema.optional(),
    sort: z.array(analysisSortSchema).max(4),
    limit: z.number().int().min(1).max(500),
    visualizationPreference: analysisVisualizationPreferenceSchema,
    assumptions: z.array(z.string().trim().min(1).max(500)).max(16)
  })
  .strict();

export const analysisPlanSchema = analysisPlanDraftSchema.superRefine((plan, context) => {
  const issue = (path: (string | number)[], message: string) =>
    context.addIssue({ code: "custom", path, message });
  if (plan.measures.length === 0 && plan.operation !== "lookup") {
    issue(["measures"], "The operation requires at least one measure.");
  }
  if (plan.operation !== "lookup" && plan.dimensions.length > 4) {
    issue(["dimensions"], "Analytical operations support at most four dimensions.");
  }
  if (plan.operation !== "trend" && plan.timeGrain !== undefined) {
    issue(["timeGrain"], "Only trend operations may specify a time grain.");
  }
  if (plan.operation === "aggregate" && plan.dimensions.length !== 0) {
    issue(["dimensions"], "An aggregate operation cannot group by dimensions.");
  }
  if (plan.operation === "compare" && plan.dimensions.length === 0) {
    issue(["dimensions"], "A comparison requires at least one dimension.");
  }
  if (plan.operation === "distribution") {
    if (plan.dimensions.length !== 1) {
      issue(["dimensions"], "A distribution requires exactly one dimension.");
    }
    if (
      plan.measures.length !== 1 ||
      !["count", "count_distinct"].includes(plan.measures[0]?.aggregation ?? "")
    ) {
      issue(["measures"], "A distribution requires one count measure.");
    }
  }
  if (plan.operation === "correlate") {
    if (
      plan.measures.length !== 2 ||
      plan.measures.some(
        (measure) => measure.columnId === null || measure.aggregation !== "value"
      )
    ) {
      issue(["measures"], "Correlation requires exactly two value measures.");
    }
    if (plan.dimensions.length !== 0) {
      issue(["dimensions"], "Correlation does not accept grouping dimensions.");
    }
    if (plan.sort.length !== 0) {
      issue(["sort"], "Correlation does not accept result sorting.");
    }
  }
  if (plan.operation === "trend" && (!plan.timeGrain || plan.dimensions.length !== 1)) {
    issue(["timeGrain"], "A trend requires one time dimension and a time grain.");
  }
  if (
    ["aggregate", "compare", "trend", "distribution", "quality"].includes(
      plan.operation
    ) &&
    plan.measures.some((measure) => measure.aggregation === "value")
  ) {
    issue(["measures"], "This operation requires aggregate measures.");
  }
  if (plan.operation === "quality") {
    if (plan.dimensions.length !== 0) {
      issue(["dimensions"], "A quality check cannot group by dimensions.");
    }
    if (plan.measures.some((measure) => measure.aggregation !== "null_count")) {
      issue(["measures"], "A quality check accepts only missing-value measures.");
    }
  }
  if (plan.operation === "lookup") {
    if (plan.dimensions.length === 0) {
      issue(["dimensions"], "A row lookup requires at least one selected column.");
    }
    if (plan.measures.length !== 0) {
      issue(["measures"], "A row lookup cannot include aggregate measures.");
    }
  }
  for (const [index, measure] of plan.measures.entries()) {
    if (measure.columnId === null && measure.aggregation !== "count") {
      context.addIssue({
        code: "custom",
        path: ["measures", index, "columnId"],
        message: "Only row count may omit a column."
      });
    }
  }
});

export const resultColumnSchema = z
  .object({
    field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(160),
    dataType: z.enum(["category", "number", "date"])
  })
  .strict();

export const analysisResultValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

export const analysisResultRowSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  analysisResultValueSchema
);

export const analysisProvenanceSchema = z
  .object({
    version: z.literal(1),
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    columnIds: z.array(z.string().uuid()).max(32),
    aggregations: z.array(analysisAggregationSchema).max(16),
    filters: z.array(analysisFilterSchema).max(16),
    timeGrain: z.enum(["day", "week", "month", "quarter", "year"]).nullable(),
    resultRowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    assumptions: z.array(z.string().max(500)).max(16),
    warnings: z.array(z.string().max(500)).max(16)
  })
  .strict();

export const analysisResultArtifactSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().uuid(),
    runId: z.string().uuid(),
    datasetId: z.string().uuid(),
    datasetVersionId: z.string().uuid(),
    planHash: z.string().regex(/^[0-9a-f]{64}$/),
    schema: z.array(resultColumnSchema).min(1).max(20),
    rows: z.array(analysisResultRowSchema).max(500),
    rowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    executionMs: z.number().int().nonnegative(),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    provenance: analysisProvenanceSchema,
    createdAt: z.string().datetime()
  })
  .strict();

export const chartSpecSchema = z
  .object({
    version: z.literal(1),
    type: z.enum(["bar", "line", "pie", "scatter", "table"]),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500).optional(),
    x: z
      .object({
        field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
        label: z.string().trim().min(1).max(160),
        dataType: z.enum(["category", "number", "date"])
      })
      .strict()
      .optional(),
    series: z
      .array(
        z
          .object({
            field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
            label: z.string().trim().min(1).max(160),
            valueFormat: z
              .enum(["raw", "integer", "compact", "currency", "percent"])
              .optional(),
            currency: z
              .string()
              .regex(/^[A-Z]{3}$/)
              .optional()
          })
          .strict()
      )
      .min(1)
      .max(8),
    categoryField: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .optional(),
    sort: z
      .object({
        field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
        direction: z.enum(["asc", "desc"])
      })
      .strict()
      .optional(),
    footnotes: z.array(z.string().trim().min(1).max(500)).max(16)
  })
  .strict();

export const chartArtifactSchema = z
  .object({
    id: z.string().uuid(),
    resultArtifactId: z.string().uuid(),
    spec: chartSpecSchema,
    createdAt: z.string().datetime()
  })
  .strict();

export const analysisArtifactBundleSchema = z
  .object({
    messageId: z.string().uuid(),
    result: analysisResultArtifactSchema,
    chart: chartArtifactSchema
  })
  .strict();

export const analysisResultResponseSchema = z
  .object({ artifact: analysisArtifactBundleSchema })
  .strict();

export type AnalysisOperationContract = z.infer<typeof analysisOperationSchema>;
export type AnalysisAggregationContract = z.infer<typeof analysisAggregationSchema>;
export type AnalysisFilterContract = z.infer<typeof analysisFilterSchema>;
export type AnalysisPlanDraftContract = z.infer<typeof analysisPlanDraftSchema>;
export type AnalysisPlanContract = z.infer<typeof analysisPlanSchema>;
export type ResultColumnContract = z.infer<typeof resultColumnSchema>;
export type AnalysisResultRowContract = z.infer<typeof analysisResultRowSchema>;
export type AnalysisProvenanceContract = z.infer<typeof analysisProvenanceSchema>;
export type AnalysisResultArtifactContract = z.infer<typeof analysisResultArtifactSchema>;
export type ChartSpecContract = z.infer<typeof chartSpecSchema>;
export type ChartArtifactContract = z.infer<typeof chartArtifactSchema>;
export type AnalysisArtifactBundleContract = z.infer<typeof analysisArtifactBundleSchema>;

export function chartFieldsMatchResult(
  chart: ChartSpecContract,
  result: Pick<AnalysisResultArtifactContract, "schema">
): boolean {
  const fields = new Map(result.schema.map((column) => [column.field, column]));
  const x = chart.x ? fields.get(chart.x.field) : undefined;
  if (chart.x && (!x || x.dataType !== chart.x.dataType)) return false;
  if (chart.categoryField && !fields.has(chart.categoryField)) return false;
  if (chart.sort && !fields.has(chart.sort.field)) return false;
  return chart.series.every((series) => {
    const column = fields.get(series.field);
    return Boolean(column && (chart.type === "table" || column.dataType === "number"));
  });
}
