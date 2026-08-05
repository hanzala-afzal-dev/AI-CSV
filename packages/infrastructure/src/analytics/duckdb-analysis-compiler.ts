import { AnalysisError, type AnalysisColumnMetadata } from "@agentic-csv/application";
import {
  analysisPlanSchema,
  type AnalysisFilterContract,
  type AnalysisPlanContract,
  type ResultColumnContract
} from "@agentic-csv/contracts";

export interface CompiledAnalysisQuery {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly schema: readonly ResultColumnContract[];
  readonly rowLimit: number;
}

export class DuckDbAnalysisCompiler {
  public constructor(private readonly maxResultRows: number) {
    if (!Number.isInteger(maxResultRows) || maxResultRows < 1 || maxResultRows > 500) {
      throw new Error("Invalid analysis compiler row limit.");
    }
  }

  public compile(input: {
    readonly plan: AnalysisPlanContract;
    readonly columns: readonly AnalysisColumnMetadata[];
  }): CompiledAnalysisQuery {
    const plan = analysisPlanSchema.parse(input.plan);
    const columns = new Map(input.columns.map((column) => [column.id, column]));
    if (columns.size !== input.columns.length)
      invalid("Dataset column IDs are not unique.");

    if (plan.operation === "correlate") {
      return compileCorrelation(plan, columns, this.maxResultRows);
    }

    const schema: ResultColumnContract[] = [];
    const select: string[] = [];
    const groupBy: number[] = [];
    for (const [index, reference] of plan.dimensions.entries()) {
      const column = requireColumn(columns, reference.columnId);
      const field = `dimension_${index + 1}`;
      const expression =
        plan.operation === "trend" && index === 0
          ? trendExpression(column, plan.timeGrain)
          : quoteIdentifier(column.canonicalName);
      select.push(`${expression} as ${quoteIdentifier(field)}`);
      groupBy.push(index + 1);
      schema.push({
        field,
        label:
          plan.operation === "trend" && plan.timeGrain
            ? `${column.originalName} (${plan.timeGrain})`
            : column.originalName,
        dataType: resultDataType(column)
      });
    }

    if (plan.operation === "lookup") {
      if (select.length === 0) invalid("A row lookup requires at least one column.");
    } else {
      for (const [index, measure] of plan.measures.entries()) {
        const column = measure.columnId ? requireColumn(columns, measure.columnId) : null;
        const field = `measure_${index + 1}`;
        select.push(
          `${measureExpression(measure.aggregation, column)} as ${quoteIdentifier(field)}`
        );
        schema.push({
          field,
          label: measureLabel(measure.aggregation, column),
          dataType: measureDataType(measure.aggregation, column)
        });
      }
    }

    const parameters: Record<string, string | number | boolean> = {};
    const where = plan.filters.map((filter, index) =>
      filterExpression(filter, requireColumn(columns, filter.columnId), index, parameters)
    );
    const order = compileSort(plan, schema);
    const rowLimit = Math.min(plan.limit, this.maxResultRows);
    const clauses = [
      `select ${select.join(", ")}`,
      "from dataset",
      where.length > 0 ? `where ${where.join(" and ")}` : "",
      groupBy.length > 0 && plan.operation !== "lookup"
        ? `group by ${groupBy.join(", ")}`
        : "",
      order ? `order by ${order}` : "",
      `limit ${rowLimit + 1}`
    ].filter(Boolean);
    const sql = clauses.join("\n");
    assertCompilerOutput(sql);
    return { sql, parameters, schema, rowLimit };
  }
}

function compileCorrelation(
  plan: AnalysisPlanContract,
  columns: ReadonlyMap<string, AnalysisColumnMetadata>,
  maxResultRows: number
): CompiledAnalysisQuery {
  const first = plan.measures[0]?.columnId;
  const second = plan.measures[1]?.columnId;
  if (!first || !second) invalid("Correlation requires two columns.");
  const left = requireNumeric(columns, first);
  const right = requireNumeric(columns, second);
  const parameters: Record<string, string | number | boolean> = {};
  const where = plan.filters.map((filter, index) =>
    filterExpression(filter, requireColumn(columns, filter.columnId), index, parameters)
  );
  const sql = [
    `select corr(cast(${quoteIdentifier(left.canonicalName)} as double), cast(${quoteIdentifier(right.canonicalName)} as double)) as "measure_1"`,
    "from dataset",
    where.length > 0 ? `where ${where.join(" and ")}` : "",
    "limit 1"
  ]
    .filter(Boolean)
    .join("\n");
  assertCompilerOutput(sql);
  return {
    sql,
    parameters,
    rowLimit: Math.min(1, maxResultRows),
    schema: [
      {
        field: "measure_1",
        label: `Correlation of ${left.originalName} and ${right.originalName}`,
        dataType: "number"
      }
    ]
  };
}

function measureExpression(
  aggregation: AnalysisPlanContract["measures"][number]["aggregation"],
  column: AnalysisColumnMetadata | null
): string {
  if (aggregation === "count") {
    return column
      ? `count(${quoteIdentifier(column.canonicalName)})::bigint`
      : "count(*)::bigint";
  }
  if (!column) invalid("The selected aggregation requires a column.");
  const identifier = quoteIdentifier(column.canonicalName);
  if (aggregation === "value") return identifier;
  if (aggregation === "count_distinct") return `count(distinct ${identifier})::bigint`;
  if (aggregation === "null_count") {
    return `count(*) filter (where ${identifier} is null or trim(cast(${identifier} as varchar)) = '')::bigint`;
  }
  if (["sum", "average"].includes(aggregation) && !isNumeric(column)) {
    invalid(`${aggregation} requires a numeric column.`);
  }
  if (aggregation === "sum") return `sum(cast(${identifier} as double))`;
  if (aggregation === "average") return `avg(cast(${identifier} as double))`;
  if (aggregation === "minimum") return `min(${identifier})`;
  if (aggregation === "maximum") return `max(${identifier})`;
  return invalid("The aggregation is not supported.");
}

function filterExpression(
  filter: AnalysisFilterContract,
  column: AnalysisColumnMetadata,
  index: number,
  parameters: Record<string, string | number | boolean>
): string {
  const identifier = quoteIdentifier(column.canonicalName);
  if (filter.operator === "is_null") {
    return `(${identifier} is null or trim(cast(${identifier} as varchar)) = '')`;
  }
  if (filter.operator === "not_null") {
    return `(${identifier} is not null and trim(cast(${identifier} as varchar)) <> '')`;
  }
  if (!("value" in filter)) invalid("Filter value is missing.");
  validateFilterValue(filter, column);
  const name = `filter_${index + 1}`;
  parameters[name] = filter.value;
  if (filter.operator === "contains") {
    if (column.inferredType !== "text") invalid("Contains requires a text column.");
    return `position(lower($${name}) in lower(cast(${identifier} as varchar))) > 0`;
  }
  const operator = {
    eq: "=",
    not_eq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<="
  }[filter.operator];
  const parameter = isDate(column)
    ? `cast($${name} as timestamp)`
    : isNumeric(column)
      ? `cast($${name} as double)`
      : `$${name}`;
  return `${identifier} ${operator} ${parameter}`;
}

function validateFilterValue(
  filter: Exclude<AnalysisFilterContract, { operator: "is_null" | "not_null" }>,
  column: AnalysisColumnMetadata
): void {
  if (isNumeric(column) && typeof filter.value !== "number") {
    invalid("Numeric filters require numeric values.");
  }
  if (column.inferredType === "boolean" && typeof filter.value !== "boolean") {
    invalid("Boolean filters require boolean values.");
  }
  if (isDate(column) && typeof filter.value !== "string") {
    invalid("Date filters require ISO date strings.");
  }
  if (isDate(column) && Number.isNaN(Date.parse(String(filter.value)))) {
    invalid("Date filter value is invalid.");
  }
  if (
    ["gt", "gte", "lt", "lte"].includes(filter.operator) &&
    column.inferredType === "text"
  ) {
    invalid("Ordered comparison is not supported for text columns.");
  }
}

function compileSort(
  plan: AnalysisPlanContract,
  schema: readonly ResultColumnContract[]
): string {
  const values = plan.sort.map((sort) => {
    const field = `${sort.target}_${sort.index + 1}`;
    if (!schema.some((column) => column.field === field)) {
      invalid("Sort target does not exist in the result.");
    }
    return `${quoteIdentifier(field)} ${sort.direction}`;
  });
  if (values.length > 0) return values.join(", ");
  if (plan.dimensions.length > 0 && plan.measures.length > 0) {
    return '"measure_1" desc, "dimension_1" asc';
  }
  return "";
}

function trendExpression(
  column: AnalysisColumnMetadata,
  grain: AnalysisPlanContract["timeGrain"]
): string {
  if (!isDate(column) || !grain) invalid("Trend dimension must be a date column.");
  return `cast(date_trunc('${grain}', ${quoteIdentifier(column.canonicalName)}) as date)`;
}

function resultDataType(
  column: AnalysisColumnMetadata
): ResultColumnContract["dataType"] {
  if (isNumeric(column)) return "number";
  if (isDate(column)) return "date";
  return "category";
}

function measureDataType(
  aggregation: AnalysisPlanContract["measures"][number]["aggregation"],
  column: AnalysisColumnMetadata | null
): ResultColumnContract["dataType"] {
  if (["count", "count_distinct", "sum", "average", "null_count"].includes(aggregation)) {
    return "number";
  }
  return column ? resultDataType(column) : "number";
}

function measureLabel(
  aggregation: AnalysisPlanContract["measures"][number]["aggregation"],
  column: AnalysisColumnMetadata | null
): string {
  const labels: Record<typeof aggregation, string> = {
    value: "Value",
    count: "Count",
    count_distinct: "Distinct count",
    sum: "Sum",
    average: "Average",
    minimum: "Minimum",
    maximum: "Maximum",
    null_count: "Missing values"
  };
  return `${labels[aggregation]}${column ? ` of ${column.originalName}` : " of rows"}`;
}

function requireColumn(
  columns: ReadonlyMap<string, AnalysisColumnMetadata>,
  id: string
): AnalysisColumnMetadata {
  const column = columns.get(id);
  if (!column) invalid("Analysis plan references an unknown dataset column.");
  return column;
}

function requireNumeric(
  columns: ReadonlyMap<string, AnalysisColumnMetadata>,
  id: string
): AnalysisColumnMetadata {
  const column = requireColumn(columns, id);
  if (!isNumeric(column)) invalid("Correlation requires numeric columns.");
  return column;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isNumeric(column: AnalysisColumnMetadata): boolean {
  return column.inferredType === "integer" || column.inferredType === "decimal";
}

function isDate(column: AnalysisColumnMetadata): boolean {
  return column.inferredType === "date" || column.inferredType === "timestamp";
}

function assertCompilerOutput(sql: string): void {
  if (
    sql.includes(";") ||
    /--|\/\*|\b(attach|detach|install|load|copy|pragma|read_csv|read_parquet|httpfs|shell)\b/i.test(
      sql
    ) ||
    !/^select\b/i.test(sql) ||
    !/\bfrom dataset\b/i.test(sql)
  ) {
    invalid("Compiler produced an unsafe analytical query.");
  }
}

function invalid(message: string): never {
  throw new AnalysisError("ANALYSIS_INVALID_PLAN", message);
}
