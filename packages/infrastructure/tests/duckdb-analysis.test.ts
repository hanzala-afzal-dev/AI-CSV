import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AnalysisColumnMetadata,
  ReadyAnalysisContext
} from "@agentic-csv/application";
import { analysisPlanSchema } from "@agentic-csv/contracts";
import { DuckDbAnalysisCompiler, DuckDbAnalysisEngine } from "../src/analytics";

const regionId = randomUUID();
const revenueId = randomUUID();
const costId = randomUUID();
const dateId = randomUUID();
const textId = randomUUID();
const columns: AnalysisColumnMetadata[] = [
  column(regionId, "region", "text", "categorical"),
  column(revenueId, "revenue", "decimal", "numeric"),
  column(costId, "cost", "decimal", "numeric"),
  column(dateId, "ordered_at", "date", "date"),
  column(textId, "channel", "text", "categorical")
];

describe("DuckDB analysis compiler", () => {
  const compiler = new DuckDbAnalysisCompiler(100);

  it("emits only a read from the controlled dataset relation with bound filters", () => {
    const compiled = compiler.compile({
      columns,
      plan: analysisPlanSchema.parse({
        version: 1,
        operation: "compare",
        dimensions: [{ columnId: regionId }],
        measures: [{ columnId: revenueId, aggregation: "sum" }],
        filters: [{ columnId: textId, operator: "eq", value: "Online' OR 1=1" }],
        sort: [{ target: "measure", index: 0, direction: "desc" }],
        limit: 25,
        visualizationPreference: "bar",
        assumptions: []
      })
    });

    expect(compiled.sql).toContain("from dataset");
    expect(compiled.sql).toContain("$filter_1");
    expect(compiled.sql).not.toContain("Online");
    expect(compiled.parameters).toEqual({ filter_1: "Online' OR 1=1" });
    expect(compiled.sql).not.toMatch(/;|attach|install|load|read_csv/i);
    expect(compiled.sql).toContain('order by "measure_1" desc, "dimension_1" asc');
  });

  it("rejects unknown columns and invalid aggregation types before execution", () => {
    const base = {
      version: 1 as const,
      operation: "aggregate" as const,
      dimensions: [],
      filters: [],
      sort: [],
      limit: 10,
      visualizationPreference: "table" as const,
      assumptions: []
    };
    expect(() =>
      compiler.compile({
        columns,
        plan: analysisPlanSchema.parse({
          ...base,
          measures: [{ columnId: randomUUID(), aggregation: "sum" }]
        })
      })
    ).toThrowError(/unknown dataset column/i);
    expect(() =>
      compiler.compile({
        columns,
        plan: analysisPlanSchema.parse({
          ...base,
          measures: [{ columnId: textId, aggregation: "sum" }]
        })
      })
    ).toThrowError(/numeric column/i);
  });

  it("applies correlation filters as bound parameters", () => {
    const compiled = compiler.compile({
      columns,
      plan: analysisPlanSchema.parse({
        version: 1,
        operation: "correlate",
        dimensions: [],
        measures: [
          { columnId: revenueId, aggregation: "value" },
          { columnId: costId, aggregation: "value" }
        ],
        filters: [{ columnId: textId, operator: "eq", value: "Online' OR 1=1" }],
        sort: [],
        limit: 1,
        visualizationPreference: "table",
        assumptions: []
      })
    });

    expect(compiled.sql).toContain("where");
    expect(compiled.sql).toContain("$filter_1");
    expect(compiled.sql).not.toContain("Online");
    expect(compiled.parameters).toEqual({ filter_1: "Online' OR 1=1" });
  });
});

describe("bounded DuckDB analysis", () => {
  it("calculates the golden revenue totals and returns typed provenance inputs", async () => {
    const fixture = resolve(process.cwd(), "../../tests/fixtures/csv/sales_clean.csv");
    const value = await readFile(fixture);
    const metadata = await stat(fixture);
    const allColumns: AnalysisColumnMetadata[] = [
      column(randomUUID(), "order_id", "text", "identifier"),
      column(dateId, "ordered_at", "date", "date"),
      column(regionId, "region", "text", "categorical"),
      column(textId, "channel", "text", "categorical"),
      column(randomUUID(), "units", "integer", "numeric"),
      column(revenueId, "revenue", "decimal", "numeric"),
      column(randomUUID(), "cost", "decimal", "numeric")
    ];
    const context: ReadyAnalysisContext = {
      userId: randomUUID(),
      conversationId: randomUUID(),
      runId: randomUUID(),
      datasetId: randomUUID(),
      datasetVersionId: randomUUID(),
      datasetName: "Sales",
      originalFilename: "sales_clean.csv",
      objectKey: "not-exposed-to-duckdb",
      sizeBytes: metadata.size,
      checksumSha256: createHash("sha256").update(value).digest("base64"),
      delimiter: ",",
      columns: allColumns
    };
    const engine = new DuckDbAnalysisEngine({
      maxScanBytes: 1_000_000,
      maxResultRows: 100,
      maxResultBytes: 100_000,
      timeoutMs: 10_000,
      memoryLimitMb: 128,
      threads: 1
    });
    const result = await engine.execute({
      context,
      content: createReadStream(fixture),
      plan: analysisPlanSchema.parse({
        version: 1,
        operation: "compare",
        dimensions: [{ columnId: regionId }],
        measures: [{ columnId: revenueId, aggregation: "sum" }],
        filters: [],
        sort: [{ target: "measure", index: 0, direction: "desc" }],
        limit: 100,
        visualizationPreference: "bar",
        assumptions: []
      })
    });

    expect(result.schema.map((item) => item.field)).toEqual(["dimension_1", "measure_1"]);
    expect(result.rows).toEqual([
      { dimension_1: "South", measure_1: 1820 },
      { dimension_1: "North", measure_1: 1630 },
      { dimension_1: "West", measure_1: 1085.5 },
      { dimension_1: "East", measure_1: 965 }
    ]);
    expect(result.truncated).toBe(false);
    expect(result.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

function column(
  id: string,
  name: string,
  inferredType: AnalysisColumnMetadata["inferredType"],
  semanticType: AnalysisColumnMetadata["semanticType"]
): AnalysisColumnMetadata {
  return {
    id,
    originalName: name,
    canonicalName: name,
    inferredType,
    semanticType,
    nullable: false
  };
}
