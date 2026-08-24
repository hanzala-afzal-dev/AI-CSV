import type { AnalysisPlanContract, ResultColumnContract } from "@agentic-csv/contracts";

export interface SuggestionColumn {
  readonly id: string;
  readonly originalName: string;
  readonly canonicalName: string;
  readonly inferredType:
    "integer" | "decimal" | "boolean" | "date" | "timestamp" | "text";
  readonly semanticType: "identifier" | "numeric" | "date" | "categorical" | "free_text";
  readonly nullable: boolean;
  readonly nullCount: number;
  readonly distinctCount: number;
}

export interface CompletedSuggestionAnalysis {
  readonly resultId: string;
  readonly question: string;
  readonly plan: AnalysisPlanContract;
  readonly resultSchema: readonly ResultColumnContract[];
  readonly rowCount: number;
}

export type SuggestionContext =
  | { readonly state: "conversation_not_found" }
  | { readonly state: "no_dataset" }
  | {
      readonly state: "not_ready";
      readonly datasetVersionId: string;
    }
  | {
      readonly state: "ready";
      readonly datasetId: string;
      readonly datasetVersionId: string;
      readonly columns: readonly SuggestionColumn[];
      readonly latestAnalysis: CompletedSuggestionAnalysis | null;
    };

export interface SuggestionRepository {
  loadContext(userId: string, conversationId: string): Promise<SuggestionContext>;
}
