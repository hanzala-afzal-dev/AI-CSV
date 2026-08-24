import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { analysisPlanSchema } from "@agentic-csv/contracts";
import {
  SuggestionError,
  SuggestionService,
  type CompletedSuggestionAnalysis,
  type SuggestionColumn,
  type SuggestionRepository
} from "../src";

const datasetId = randomUUID();
const datasetVersionId = randomUUID();
const resultId = randomUUID();
const region = column("Region", "text", "categorical", 4);
const channel = column("Channel", "text", "categorical", 3);
const revenue = column("Revenue", "decimal", "numeric", 100);
const cost = column("Cost", "decimal", "numeric", 100);

describe("SuggestionService", () => {
  it("creates stable initial suggestions without a time trend when no date exists", async () => {
    const repository = readyRepository([region, revenue, cost]);
    const service = new SuggestionService(repository);

    const first = await service.getForConversation(randomUUID(), randomUUID());
    const second = await service.getForConversation(randomUUID(), randomUUID());

    expect(first).toEqual(second);
    expect(first.state).toBe("ready");
    if (first.state !== "ready") throw new Error("Expected ready suggestions.");
    expect(first.initial).toHaveLength(6);
    expect(first.initial.map((suggestion) => suggestion.kind)).not.toContain("trend");
    expect(
      first.initial.every((suggestion) => suggestion.source === "initial_profile")
    ).toBe(true);
    expect(
      first.initial.flatMap((suggestion) => suggestion.referencedColumnIds)
    ).not.toContain(expect.stringMatching(/[^0-9a-f-]/i));
  });

  it("binds diverse follow-ups to the latest verified result without repeating it", async () => {
    const completedQuestion = 'Compare total "Revenue" by "Region".';
    const repository = readyRepository([region, channel, revenue, cost], {
      resultId,
      question: completedQuestion,
      plan: analysisPlanSchema.parse({
        version: 1,
        operation: "compare",
        dimensions: [{ columnId: region.id }],
        measures: [{ columnId: revenue.id, aggregation: "sum" }],
        filters: [],
        sort: [],
        limit: 20,
        visualizationPreference: "bar",
        assumptions: []
      }),
      resultSchema: [
        { field: "dimension_1", label: "Region", dataType: "category" },
        { field: "measure_1", label: "Revenue", dataType: "number" }
      ],
      rowCount: 4
    });
    const service = new SuggestionService(repository);

    const response = await service.getForConversation(randomUUID(), randomUUID());

    if (response.state !== "ready") throw new Error("Expected ready suggestions.");
    expect(response.followUps.length).toBeGreaterThan(0);
    expect(response.followUps.length).toBeLessThanOrEqual(4);
    expect(
      response.followUps.every(
        (suggestion) =>
          suggestion.source === "follow_up_result" &&
          suggestion.basedOnResultId === resultId
      )
    ).toBe(true);
    expect(response.followUps.map((suggestion) => suggestion.promptText)).not.toContain(
      completedQuestion
    );
    const allowedIds = new Set([region.id, channel.id, revenue.id, cost.id]);
    expect(
      response.followUps.every((suggestion) =>
        suggestion.referencedColumnIds.every((id) => allowedIds.has(id))
      )
    ).toBe(true);
  });

  it("returns empty states and hides foreign conversations behind not found", async () => {
    const noDataset = new SuggestionService({
      loadContext: vi.fn().mockResolvedValue({ state: "no_dataset" })
    });
    await expect(
      noDataset.getForConversation(randomUUID(), randomUUID())
    ).resolves.toMatchObject({ state: "no_dataset", initial: [], followUps: [] });

    const hidden = new SuggestionService({
      loadContext: vi.fn().mockResolvedValue({ state: "conversation_not_found" })
    });
    await expect(hidden.getForConversation(randomUUID(), randomUUID())).rejects.toEqual(
      new SuggestionError("CONVERSATION_NOT_FOUND", "Conversation was not found.")
    );
  });
});

function readyRepository(
  columns: readonly SuggestionColumn[],
  latestAnalysis: CompletedSuggestionAnalysis | null = null
): SuggestionRepository {
  return {
    loadContext: vi.fn().mockResolvedValue({
      state: "ready",
      datasetId,
      datasetVersionId,
      columns,
      latestAnalysis
    })
  };
}

function column(
  originalName: string,
  inferredType: SuggestionColumn["inferredType"],
  semanticType: SuggestionColumn["semanticType"],
  distinctCount: number
): SuggestionColumn {
  return {
    id: randomUUID(),
    originalName,
    canonicalName: originalName.toLowerCase(),
    inferredType,
    semanticType,
    nullable: true,
    nullCount: 1,
    distinctCount
  };
}
