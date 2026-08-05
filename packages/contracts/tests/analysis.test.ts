import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { analysisPlanSchema, chartFieldsMatchResult, chartSpecSchema } from "../src";

describe("analysis contracts", () => {
  it("accepts a versioned column-ID plan without executable input", () => {
    expect(
      analysisPlanSchema.parse({
        version: 1,
        operation: "compare",
        dimensions: [{ columnId: randomUUID() }],
        measures: [{ columnId: randomUUID(), aggregation: "sum" }],
        filters: [],
        sort: [{ target: "measure", index: 0, direction: "desc" }],
        limit: 100,
        visualizationPreference: "bar",
        assumptions: []
      })
    ).toMatchObject({ operation: "compare", limit: 100 });
  });

  it("rejects SQL, file paths, and malformed correlation shapes", () => {
    const plan = {
      version: 1,
      operation: "correlate",
      dimensions: [],
      measures: [{ columnId: randomUUID(), aggregation: "value" }],
      filters: [],
      sort: [],
      limit: 100,
      visualizationPreference: "table",
      assumptions: [],
      sql: "select * from read_csv('/etc/passwd')"
    };
    expect(analysisPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects operation fields that a compiler would otherwise ignore", () => {
    const columnIds = Array.from({ length: 8 }, () => randomUUID());
    const lookup = {
      version: 1,
      operation: "lookup",
      dimensions: columnIds.map((columnId) => ({ columnId })),
      measures: [],
      filters: [],
      sort: [],
      limit: 25,
      visualizationPreference: "table",
      assumptions: []
    };
    expect(analysisPlanSchema.safeParse(lookup).success).toBe(true);
    expect(
      analysisPlanSchema.safeParse({
        ...lookup,
        measures: [{ columnId: columnIds[0], aggregation: "sum" }]
      }).success
    ).toBe(false);
    expect(
      analysisPlanSchema.safeParse({
        ...lookup,
        operation: "correlate",
        dimensions: [{ columnId: columnIds[0] }],
        measures: [
          { columnId: columnIds[0], aggregation: "value" },
          { columnId: columnIds[1], aggregation: "value" }
        ]
      }).success
    ).toBe(false);
    expect(
      analysisPlanSchema.safeParse({
        ...lookup,
        operation: "aggregate",
        dimensions: [],
        measures: [{ columnId: columnIds[0], aggregation: "sum" }],
        timeGrain: "month"
      }).success
    ).toBe(false);
  });

  it("validates every chart field against its stored result schema", () => {
    const chart = chartSpecSchema.parse({
      version: 1,
      type: "bar",
      title: "Revenue by region",
      x: { field: "dimension_1", label: "Region", dataType: "category" },
      series: [{ field: "measure_1", label: "Revenue" }],
      categoryField: "dimension_1",
      footnotes: []
    });
    const result = {
      schema: [
        { field: "dimension_1", label: "Region", dataType: "category" as const },
        { field: "measure_1", label: "Revenue", dataType: "number" as const }
      ]
    };
    expect(chartFieldsMatchResult(chart, result)).toBe(true);
    expect(
      chartFieldsMatchResult(
        { ...chart, series: [{ field: "profit", label: "Profit" }] },
        result
      )
    ).toBe(false);
  });
});
