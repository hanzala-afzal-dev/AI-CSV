import { createUuidV7 } from "@agentic-csv/domain";
import {
  chartFieldsMatchResult,
  chartSpecSchema,
  type AnalysisPlanContract,
  type AnalysisProvenanceContract,
  type ChartSpecContract
} from "@agentic-csv/contracts";
import type { ObjectStorage } from "../ports/object-storage";
import type { CompletedAnalysis } from "../conversations/ports";
import type {
  AnalysisEngine,
  AnalysisPlanner,
  AnalysisReadRepository,
  ReadyAnalysisContext
} from "./ports";

export interface AnalysisServiceResult {
  readonly handled: boolean;
  readonly text: string;
  readonly analysis?: CompletedAnalysis;
}

export class AnalysisService {
  public constructor(
    private readonly repository: AnalysisReadRepository,
    private readonly storage: ObjectStorage,
    private readonly planner: AnalysisPlanner,
    private readonly engine: AnalysisEngine,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = createUuidV7
  ) {}

  public async analyze(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly question: string;
  }): Promise<AnalysisServiceResult> {
    const loaded = await this.repository.loadRunContext(input);
    if (loaded.state === "no_dataset") {
      return { handled: false, text: "" };
    }
    if (loaded.state === "not_ready") {
      return {
        handled: true,
        text: `${loaded.originalFilename} is still ${loaded.status.replaceAll("_", " ")}. Analysis will be available after profiling completes.`
      };
    }

    const planned = this.planner.plan({
      question: input.question,
      columns: loaded.context.columns
    });
    if (planned.state === "unsupported") {
      return { handled: true, text: planned.message };
    }

    const content = await this.storage.readObject(loaded.context.objectKey);
    const executed = await this.engine.execute({
      context: loaded.context,
      plan: planned.plan,
      content
    });
    const createdAt = this.now();
    const provenance = createProvenance(loaded.context, planned.plan, executed);
    const chartSpec = selectChart(planned.plan, executed.schema, executed.rows.length, [
      ...executed.warnings,
      ...(executed.truncated ? ["The displayed result is truncated."] : [])
    ]);
    if (!chartFieldsMatchResult(chartSpec, { schema: [...executed.schema] })) {
      throw new Error("Generated chart fields did not match the result schema.");
    }
    const analysis: CompletedAnalysis = {
      planId: this.createId(),
      resultId: this.createId(),
      chartArtifactId: this.createId(),
      datasetId: loaded.context.datasetId,
      datasetVersionId: loaded.context.datasetVersionId,
      plan: planned.plan,
      planHash: executed.planHash,
      schema: [...executed.schema],
      rows: [...executed.rows],
      rowCount: executed.rowCount,
      truncated: executed.truncated,
      executionMs: executed.executionMs,
      checksum: executed.checksum,
      provenance,
      chartSpec,
      createdAt
    };
    return {
      handled: true,
      text: explainResult(loaded.context, planned.plan, analysis),
      analysis
    };
  }
}

function createProvenance(
  context: ReadyAnalysisContext,
  plan: AnalysisPlanContract,
  result: Awaited<ReturnType<AnalysisEngine["execute"]>>
): AnalysisProvenanceContract {
  const columnIds = new Set<string>();
  for (const dimension of plan.dimensions) columnIds.add(dimension.columnId);
  for (const measure of plan.measures) {
    if (measure.columnId) columnIds.add(measure.columnId);
  }
  for (const filter of plan.filters) columnIds.add(filter.columnId);
  return {
    version: 1,
    datasetId: context.datasetId,
    datasetVersionId: context.datasetVersionId,
    columnIds: [...columnIds],
    aggregations: plan.measures.map((measure) => measure.aggregation),
    filters: plan.filters,
    timeGrain: plan.timeGrain ?? null,
    resultRowCount: result.rowCount,
    truncated: result.truncated,
    assumptions: plan.assumptions,
    warnings: [...result.warnings]
  };
}

function selectChart(
  plan: AnalysisPlanContract,
  schema: Awaited<ReturnType<AnalysisEngine["execute"]>>["schema"],
  visibleRows: number,
  footnotes: readonly string[]
): ChartSpecContract {
  const categories = schema.filter((column) => column.dataType !== "number");
  const numeric = schema.filter((column) => column.dataType === "number");
  const requested = plan.visualizationPreference;
  let type: ChartSpecContract["type"] = "table";
  if (visibleRows > 0 && requested !== "none" && requested !== "table") {
    if (requested === "scatter" && numeric.length >= 2) {
      type = "scatter";
    } else if (numeric.length > 0 && categories.length > 0) {
      if (["bar", "line", "pie"].includes(requested)) {
        type = requested as "bar" | "line" | "pie";
      } else if (plan.operation === "trend") {
        type = "line";
      } else if (plan.operation === "distribution" && visibleRows <= 8) {
        type = "pie";
      } else if (["compare", "distribution", "aggregate"].includes(plan.operation)) {
        type = "bar";
      }
    }
  }
  if (type === "line" && categories[0]?.dataType !== "date") type = "table";
  if (type === "scatter" && numeric.length < 2) type = "table";
  const x =
    type === "scatter" ? numeric[0] : type === "table" ? undefined : categories[0];
  const seriesColumns =
    type === "table"
      ? schema.slice(0, 8)
      : type === "scatter"
        ? numeric.slice(1, 5)
        : numeric.slice(0, 4);
  const title = chartTitle(
    plan,
    schema.map((column) => column.label)
  );
  return chartSpecSchema.parse({
    version: 1,
    type,
    title,
    description: "Calculated from the active immutable dataset version.",
    ...(x ? { x: { field: x.field, label: x.label, dataType: x.dataType } } : {}),
    series: seriesColumns.map((column) => ({
      field: column.field,
      label: column.label,
      valueFormat: column.dataType === "number" ? "compact" : "raw"
    })),
    ...(x && type !== "scatter" ? { categoryField: x.field } : {}),
    footnotes: [...footnotes]
  });
}

function chartTitle(plan: AnalysisPlanContract, labels: readonly string[]): string {
  const subject = labels.slice(0, 3).join(" and ");
  const prefix: Record<AnalysisPlanContract["operation"], string> = {
    aggregate: "Summary",
    compare: "Comparison",
    trend: "Trend",
    distribution: "Distribution",
    correlate: "Correlation",
    quality: "Missing values",
    lookup: "Dataset rows"
  };
  return `${prefix[plan.operation]}${subject ? `: ${subject}` : ""}`.slice(0, 160);
}

function explainResult(
  context: ReadyAnalysisContext,
  plan: AnalysisPlanContract,
  analysis: CompletedAnalysis
): string {
  if (analysis.rowCount === 0) {
    return `No rows in ${context.datasetName} matched this analysis.`;
  }
  const first = analysis.rows[0];
  const numericColumn = analysis.schema.find((column) => column.dataType === "number");
  if (analysis.rowCount === 1 && first && numericColumn) {
    const value = first[numericColumn.field];
    return `${numericColumn.label} is ${formatValue(value)} for ${context.datasetName}.`;
  }
  const label: Record<AnalysisPlanContract["operation"], string> = {
    aggregate: "summary rows",
    compare: "groups",
    trend: "time periods",
    distribution: "categories",
    correlate: "correlation results",
    quality: "quality checks",
    lookup: "rows"
  };
  return `Calculated ${analysis.rowCount} ${label[plan.operation]} from ${context.datasetName}${analysis.truncated ? "; the displayed result is truncated" : ""}.`;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
  }
  if (value === null || value === undefined) return "no value";
  return String(value);
}
