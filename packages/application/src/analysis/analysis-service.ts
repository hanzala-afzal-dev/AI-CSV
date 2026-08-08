import { createUuidV7 } from "@agentic-csv/domain";
import {
  chartFieldsMatchResult,
  chartSpecSchema,
  type AnalysisPlanContract,
  type AnalysisProvenanceContract,
  type ChartSpecContract
} from "@agentic-csv/contracts";
import { ObjectStorageError, type ObjectStorage } from "../ports/object-storage";
import type { CompletedAnalysis } from "../conversations/ports";
import { AnalysisError } from "./analysis-error";
import type {
  AnalysisEngine,
  AnalysisPlanner,
  AnalysisProfileResult,
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

  public async loadProfile(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<AnalysisProfileResult> {
    const loaded = await this.repository.loadRunContext(input);
    if (loaded.state !== "ready") return loaded;
    return {
      state: "ready",
      context: {
        userId: loaded.context.userId,
        conversationId: loaded.context.conversationId,
        runId: loaded.context.runId,
        datasetId: loaded.context.datasetId,
        datasetVersionId: loaded.context.datasetVersionId,
        datasetName: loaded.context.datasetName,
        originalFilename: loaded.context.originalFilename,
        columns: loaded.context.columns
      }
    };
  }

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

    return this.executeLoaded(loaded.context, planned.plan);
  }

  public async executePlan(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly question: string;
    readonly plan: AnalysisPlanContract;
  }): Promise<AnalysisServiceResult> {
    const loaded = await this.repository.loadRunContext(input);
    if (loaded.state === "no_dataset") return { handled: false, text: "" };
    if (loaded.state === "not_ready") {
      return {
        handled: true,
        text: `${loaded.originalFilename} is still ${loaded.status.replaceAll("_", " ")}. Analysis will be available after profiling completes.`
      };
    }
    return this.executeLoaded(loaded.context, input.plan);
  }

  private async executeLoaded(
    context: ReadyAnalysisContext,
    plan: AnalysisPlanContract
  ): Promise<AnalysisServiceResult> {
    const content = await readAnalysisSource(this.storage, context.objectKey);
    const executed = await this.engine.execute({
      context,
      plan,
      content
    });
    const createdAt = this.now();
    const provenance = createProvenance(context, plan, executed);
    const chartSpec = selectChart(plan, executed.schema, executed.rows.length, [
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
      datasetId: context.datasetId,
      datasetVersionId: context.datasetVersionId,
      plan,
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
      text: explainResult(context, plan, analysis),
      analysis
    };
  }
}

async function readAnalysisSource(
  storage: ObjectStorage,
  objectKey: string
): Promise<AsyncIterable<Uint8Array>> {
  try {
    return await storage.readObject(objectKey);
  } catch (error) {
    if (error instanceof ObjectStorageError) {
      if (error.code === "OBJECT_NOT_FOUND") {
        throw new AnalysisError(
          "ANALYSIS_SOURCE_MISSING",
          "The attached CSV is no longer available. Upload it again and attach the new dataset."
        );
      }
      throw new AnalysisError(
        "ANALYSIS_SOURCE_UNAVAILABLE",
        "The CSV storage service is temporarily unavailable. Try again later."
      );
    }
    throw error;
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
