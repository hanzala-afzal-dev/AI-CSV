import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { analysisPlanSchema } from "@agentic-csv/contracts";
import {
  AnalysisError,
  AnalysisService,
  DeterministicAnalysisPlanner,
  ObjectStorageError,
  type AnalysisColumnMetadata,
  type AnalysisEngine,
  type AnalysisReadRepository,
  type ObjectStorage
} from "../src";

const regionId = randomUUID();
const revenueId = randomUUID();
const costId = randomUUID();
const dateId = randomUUID();

const columns: AnalysisColumnMetadata[] = [
  column(regionId, "region", "text", "categorical"),
  column(revenueId, "revenue", "decimal", "numeric"),
  column(costId, "cost", "decimal", "numeric"),
  column(dateId, "order_date", "date", "date")
];

describe("deterministic analysis planning", () => {
  const planner = new DeterministicAnalysisPlanner();

  it("plans a grouped sum using stored column IDs", () => {
    expect(planner.plan({ question: "Total revenue by region", columns })).toMatchObject({
      state: "planned",
      plan: {
        operation: "compare",
        dimensions: [{ columnId: regionId }],
        measures: [{ columnId: revenueId, aggregation: "sum" }]
      }
    });
  });

  it("plans monthly trends and refuses an unresolved correlation", () => {
    expect(
      planner.plan({ question: "Monthly revenue trend over order date", columns })
    ).toMatchObject({
      state: "planned",
      plan: { operation: "trend", timeGrain: "month" }
    });
    expect(
      planner.plan({ question: "Show correlation for revenue", columns })
    ).toMatchObject({ state: "unsupported" });
  });
});

describe("analysis service", () => {
  it("maps a missing immutable CSV to an actionable typed failure", async () => {
    const repository = {
      loadRunContext: vi.fn().mockResolvedValue({
        state: "ready",
        context: readyContext()
      }),
      getArtifact: vi.fn()
    } satisfies AnalysisReadRepository;
    const service = new AnalysisService(
      repository,
      {
        readObject: vi
          .fn()
          .mockRejectedValue(
            new ObjectStorageError("OBJECT_NOT_FOUND", "safe storage detail")
          )
      } as unknown as ObjectStorage,
      new DeterministicAnalysisPlanner(),
      { execute: vi.fn() }
    );

    await expect(
      service.executePlan({
        userId: randomUUID(),
        conversationId: randomUUID(),
        runId: randomUUID(),
        question: "What is this CSV about?",
        plan: analysisPlanSchema.parse({
          version: 1,
          operation: "lookup",
          dimensions: [{ columnId: regionId }],
          measures: [],
          filters: [],
          sort: [],
          limit: 10,
          visualizationPreference: "table",
          assumptions: []
        })
      })
    ).rejects.toEqual(
      new AnalysisError(
        "ANALYSIS_SOURCE_MISSING",
        "The attached CSV is no longer available. Upload it again and attach the new dataset."
      )
    );
  });

  it("creates provenance and a validated chart without exposing the object key", async () => {
    const repository = {
      loadRunContext: vi.fn().mockResolvedValue({
        state: "ready",
        context: {
          userId: randomUUID(),
          conversationId: randomUUID(),
          runId: randomUUID(),
          datasetId: randomUUID(),
          datasetVersionId: randomUUID(),
          datasetName: "Sales",
          originalFilename: "sales.csv",
          objectKey: "server-owned-key",
          sizeBytes: 10,
          checksumSha256: "checksum",
          delimiter: ",",
          columns
        }
      }),
      getArtifact: vi.fn()
    } satisfies AnalysisReadRepository;
    const storage = {
      readObject: vi.fn().mockResolvedValue(
        (async function* () {
          yield new Uint8Array([1]);
        })()
      )
    } as unknown as ObjectStorage;
    const engine = {
      execute: vi.fn().mockResolvedValue({
        planHash: "a".repeat(64),
        schema: [
          { field: "dimension_1", label: "region", dataType: "category" },
          { field: "measure_1", label: "Sum of revenue", dataType: "number" }
        ],
        rows: [{ dimension_1: "North", measure_1: 42 }],
        rowCount: 1,
        truncated: false,
        executionMs: 12,
        checksum: "b".repeat(64),
        warnings: []
      })
    } satisfies AnalysisEngine;
    const service = new AnalysisService(
      repository,
      storage,
      new DeterministicAnalysisPlanner(),
      engine,
      () => new Date("2026-08-05T12:00:00.000Z")
    );
    const context = await repository.loadRunContext.mock.results;

    const result = await service.analyze({
      userId: randomUUID(),
      conversationId: randomUUID(),
      runId: randomUUID(),
      question: "Total revenue by region"
    });

    expect(result.analysis).toMatchObject({
      planHash: "a".repeat(64),
      chartSpec: { type: "bar" },
      provenance: {
        columnIds: expect.arrayContaining([regionId, revenueId]),
        aggregations: ["sum"]
      }
    });
    expect(JSON.stringify(result)).not.toContain("server-owned-key");
    expect(context).toBeDefined();
  });

  it("maps two numeric lookup fields to a validated scatter chart", async () => {
    const repository = {
      loadRunContext: vi.fn().mockResolvedValue({
        state: "ready",
        context: {
          userId: randomUUID(),
          conversationId: randomUUID(),
          runId: randomUUID(),
          datasetId: randomUUID(),
          datasetVersionId: randomUUID(),
          datasetName: "Sales",
          originalFilename: "sales.csv",
          objectKey: "server-owned-key",
          sizeBytes: 10,
          checksumSha256: "checksum",
          delimiter: ",",
          columns
        }
      }),
      getArtifact: vi.fn()
    } satisfies AnalysisReadRepository;
    const plan = analysisPlanSchema.parse({
      version: 1,
      operation: "lookup",
      dimensions: [{ columnId: revenueId }, { columnId: costId }],
      measures: [],
      filters: [],
      sort: [],
      limit: 100,
      visualizationPreference: "scatter",
      assumptions: []
    });
    const service = new AnalysisService(
      repository,
      {
        readObject: vi.fn().mockResolvedValue(
          (async function* () {
            yield new Uint8Array([1]);
          })()
        )
      } as unknown as ObjectStorage,
      { plan: vi.fn().mockReturnValue({ state: "planned", plan }) },
      {
        execute: vi.fn().mockResolvedValue({
          planHash: "a".repeat(64),
          schema: [
            { field: "dimension_1", label: "revenue", dataType: "number" },
            { field: "dimension_2", label: "cost", dataType: "number" }
          ],
          rows: [
            { dimension_1: 100, dimension_2: 80 },
            { dimension_1: 120, dimension_2: 95 }
          ],
          rowCount: 2,
          truncated: false,
          executionMs: 5,
          checksum: "b".repeat(64),
          warnings: []
        })
      },
      () => new Date("2026-08-05T12:00:00.000Z")
    );

    const result = await service.analyze({
      userId: randomUUID(),
      conversationId: randomUUID(),
      runId: randomUUID(),
      question: "Plot revenue against cost"
    });

    expect(result.analysis?.chartSpec).toMatchObject({
      type: "scatter",
      x: { field: "dimension_1", dataType: "number" },
      series: [{ field: "dimension_2" }]
    });
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

function readyContext() {
  return {
    userId: randomUUID(),
    conversationId: randomUUID(),
    runId: randomUUID(),
    datasetId: randomUUID(),
    datasetVersionId: randomUUID(),
    datasetName: "Sales",
    originalFilename: "sales.csv",
    objectKey: "server-owned-key",
    sizeBytes: 10,
    checksumSha256: "checksum",
    delimiter: "," as const,
    columns
  };
}
