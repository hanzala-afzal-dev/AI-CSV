import { createHash } from "node:crypto";
import {
  promptSuggestionResponseSchema,
  promptSuggestionSchema,
  type PromptSuggestionContract,
  type PromptSuggestionResponseContract,
  type SuggestionKindContract,
  type SuggestionSourceContract
} from "@agentic-csv/contracts";
import { SuggestionError } from "./suggestion-error";
import type {
  CompletedSuggestionAnalysis,
  SuggestionColumn,
  SuggestionRepository
} from "./ports";

interface SuggestionDraft {
  readonly kind: SuggestionKindContract;
  readonly promptText: string;
  readonly columns: readonly SuggestionColumn[];
}

export class SuggestionService {
  public constructor(private readonly repository: SuggestionRepository) {}

  public async getForConversation(
    userId: string,
    conversationId: string
  ): Promise<PromptSuggestionResponseContract> {
    const context = await this.repository.loadContext(userId, conversationId);
    if (context.state === "conversation_not_found") {
      throw new SuggestionError("CONVERSATION_NOT_FOUND", "Conversation was not found.");
    }
    if (context.state === "no_dataset") {
      return promptSuggestionResponseSchema.parse({
        version: 1,
        state: "no_dataset",
        datasetVersionId: null,
        initial: [],
        followUps: []
      });
    }
    if (context.state === "not_ready") {
      return promptSuggestionResponseSchema.parse({
        version: 1,
        state: "not_ready",
        datasetVersionId: context.datasetVersionId,
        initial: [],
        followUps: []
      });
    }

    const initial = createInitialDrafts(context.columns)
      .slice(0, 6)
      .map((draft) =>
        materialize(draft, "initial_profile", context.datasetVersionId, null)
      );
    const followUps = context.latestAnalysis
      ? createFollowUpDrafts(context.columns, context.latestAnalysis)
          .filter(
            (draft) =>
              normalize(draft.promptText) !==
              normalize(context.latestAnalysis?.question ?? "")
          )
          .slice(0, 4)
          .map((draft) =>
            materialize(
              draft,
              "follow_up_result",
              context.datasetVersionId,
              context.latestAnalysis?.resultId ?? null
            )
          )
      : [];

    return promptSuggestionResponseSchema.parse({
      version: 1,
      state: "ready",
      datasetVersionId: context.datasetVersionId,
      initial,
      followUps: uniqueSuggestions(followUps)
    });
  }
}

function createInitialDrafts(columns: readonly SuggestionColumn[]): SuggestionDraft[] {
  const numeric = numericColumns(columns);
  const dates = dateColumns(columns);
  const categories = categoricalColumns(columns);
  const visible = columns.slice(0, 4);
  const missing = columns.filter((column) => column.nullable || column.nullCount > 0);
  const drafts: SuggestionDraft[] = [
    {
      kind: "overview",
      promptText: `Show the first 20 rows for ${labelList(visible)}.`,
      columns: visible
    },
    {
      kind: "row_count",
      promptText: "How many rows are in this dataset?",
      columns: []
    },
    {
      kind: "missing_values",
      promptText: `How many values are missing in ${labelList((missing.length > 0 ? missing : columns).slice(0, 4))}?`,
      columns: (missing.length > 0 ? missing : columns).slice(0, 4)
    }
  ];
  const measure = numeric[0];
  const category = categories[0];
  const date = dates[0];
  if (measure && category) {
    drafts.push({
      kind: "comparison",
      promptText: `Compare total ${label(measure)} by ${label(category)}.`,
      columns: [measure, category]
    });
  }
  if (measure && date) {
    drafts.push({
      kind: "trend",
      promptText: `Show the monthly trend of total ${label(measure)} by ${label(date)}.`,
      columns: [measure, date]
    });
  }
  if (numeric[0] && numeric[1]) {
    drafts.push({
      kind: "correlation",
      promptText: `Show the correlation between ${label(numeric[0])} and ${label(numeric[1])}.`,
      columns: [numeric[0], numeric[1]]
    });
  }
  if (category) {
    drafts.push({
      kind: "distribution",
      promptText: `Show the distribution of ${label(category)}.`,
      columns: [category]
    });
  }
  return uniqueDrafts(drafts).slice(0, Math.max(3, Math.min(6, drafts.length)));
}

function createFollowUpDrafts(
  columns: readonly SuggestionColumn[],
  analysis: CompletedSuggestionAnalysis
): SuggestionDraft[] {
  if (analysis.resultSchema.length === 0) return [];
  const referenced = new Set<string>([
    ...analysis.plan.dimensions.map((item) => item.columnId),
    ...analysis.plan.measures.flatMap((item) => (item.columnId ? [item.columnId] : [])),
    ...analysis.plan.filters.map((item) => item.columnId)
  ]);
  const byId = new Map(columns.map((column) => [column.id, column]));
  const measure = analysis.plan.measures
    .map((item) => (item.columnId ? byId.get(item.columnId) : undefined))
    .find((column): column is SuggestionColumn => Boolean(column));
  const currentDimension = analysis.plan.dimensions
    .map((item) => byId.get(item.columnId))
    .find((column): column is SuggestionColumn => Boolean(column));
  const unusedCategory = categoricalColumns(columns).find(
    (column) => !referenced.has(column.id)
  );
  const date = dateColumns(columns).find((column) => !referenced.has(column.id));
  const unusedNumeric = numericColumns(columns).find(
    (column) => !referenced.has(column.id)
  );
  const drafts: SuggestionDraft[] = [];

  if (measure && unusedCategory) {
    drafts.push({
      kind: "drill_down",
      promptText: `Break down total ${label(measure)} by ${label(unusedCategory)}.`,
      columns: [measure, unusedCategory]
    });
  }
  if (measure && date && analysis.plan.operation !== "trend") {
    drafts.push({
      kind: "trend",
      promptText: `Show the monthly trend of total ${label(measure)} by ${label(date)}.`,
      columns: [measure, date]
    });
  }
  if (measure && unusedNumeric && measure.id !== unusedNumeric.id) {
    drafts.push({
      kind: "correlation",
      promptText: `Show the correlation between ${label(measure)} and ${label(unusedNumeric)}.`,
      columns: [measure, unusedNumeric]
    });
  }
  if (measure && currentDimension) {
    drafts.push({
      kind: "top_values",
      promptText: `Show the top 10 ${label(currentDimension)} values by total ${label(measure)}.`,
      columns: [currentDimension, measure]
    });
  }
  const qualityColumns = [...referenced]
    .map((id) => byId.get(id))
    .filter((column): column is SuggestionColumn => Boolean(column))
    .slice(0, 4);
  if (qualityColumns.length > 0) {
    drafts.push({
      kind: "missing_values",
      promptText: `Check missing values in ${labelList(qualityColumns)}.`,
      columns: qualityColumns
    });
  }
  return uniqueDrafts(drafts);
}

function materialize(
  draft: SuggestionDraft,
  source: SuggestionSourceContract,
  datasetVersionId: string,
  basedOnResultId: string | null
): PromptSuggestionContract {
  const promptText = boundPrompt(draft.promptText);
  const referencedColumnIds = [...new Set(draft.columns.map((column) => column.id))];
  const identity = [
    datasetVersionId,
    source,
    basedOnResultId ?? "initial",
    draft.kind,
    normalize(promptText),
    ...referencedColumnIds
  ].join("|");
  return promptSuggestionSchema.parse({
    id: `suggestion_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`,
    source,
    kind: draft.kind,
    displayText: promptText,
    promptText,
    referencedColumnIds,
    basedOnResultId
  });
}

function numericColumns(columns: readonly SuggestionColumn[]): SuggestionColumn[] {
  return columns.filter(
    (column) =>
      column.semanticType === "numeric" &&
      ["integer", "decimal"].includes(column.inferredType)
  );
}

function dateColumns(columns: readonly SuggestionColumn[]): SuggestionColumn[] {
  return columns.filter(
    (column) =>
      column.semanticType === "date" ||
      column.inferredType === "date" ||
      column.inferredType === "timestamp"
  );
}

function categoricalColumns(columns: readonly SuggestionColumn[]): SuggestionColumn[] {
  return columns.filter(
    (column) =>
      column.semanticType === "categorical" &&
      column.distinctCount > 1 &&
      column.distinctCount <= 100
  );
}

function label(column: SuggestionColumn): string {
  const safe = stripControlCharacters(column.originalName.normalize("NFKC"))
    .replaceAll('"', "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `"${safe || column.canonicalName.slice(0, 80)}"`;
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }).join("");
}

function labelList(columns: readonly SuggestionColumn[]): string {
  const values = columns.map(label);
  if (values.length === 0) return '"available columns"';
  if (values.length === 1) return values[0] ?? '"available columns"';
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function boundPrompt(value: string): string {
  if (value.length <= 300) return value;
  return `${value.slice(0, 296).trimEnd()}...`;
}

function uniqueDrafts(drafts: readonly SuggestionDraft[]): SuggestionDraft[] {
  return [
    ...new Map(drafts.map((draft) => [normalize(draft.promptText), draft])).values()
  ];
}

function uniqueSuggestions(
  suggestions: readonly PromptSuggestionContract[]
): PromptSuggestionContract[] {
  return [
    ...new Map(
      suggestions.map((suggestion) => [normalize(suggestion.promptText), suggestion])
    ).values()
  ];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
