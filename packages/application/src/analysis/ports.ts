import type {
  AnalysisArtifactBundleContract,
  AnalysisPlanContract,
  AnalysisResultRowContract,
  ResultColumnContract
} from "@agentic-csv/contracts";

export interface AnalysisColumnMetadata {
  readonly id: string;
  readonly originalName: string;
  readonly canonicalName: string;
  readonly inferredType:
    "integer" | "decimal" | "boolean" | "date" | "timestamp" | "text";
  readonly semanticType: "identifier" | "numeric" | "date" | "categorical" | "free_text";
  readonly nullable: boolean;
}

export interface ReadyAnalysisContext {
  readonly userId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly datasetName: string;
  readonly originalFilename: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly delimiter: "," | ";" | "\t" | "|";
  readonly columns: readonly AnalysisColumnMetadata[];
}

export type AnalysisContextResult =
  | { readonly state: "no_dataset" }
  | {
      readonly state: "not_ready";
      readonly originalFilename: string;
      readonly status: string;
    }
  | { readonly state: "ready"; readonly context: ReadyAnalysisContext };

export interface AnalysisReadRepository {
  loadRunContext(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<AnalysisContextResult>;
  getArtifact(
    userId: string,
    resultId: string
  ): Promise<AnalysisArtifactBundleContract | null>;
}

export type AnalysisPlanningResult =
  | { readonly state: "planned"; readonly plan: AnalysisPlanContract }
  | { readonly state: "unsupported"; readonly message: string };

export interface AnalysisPlanner {
  plan(input: {
    readonly question: string;
    readonly columns: readonly AnalysisColumnMetadata[];
  }): AnalysisPlanningResult;
}

export interface AnalysisExecutionResult {
  readonly planHash: string;
  readonly schema: readonly ResultColumnContract[];
  readonly rows: readonly AnalysisResultRowContract[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly executionMs: number;
  readonly checksum: string;
  readonly warnings: readonly string[];
}

export interface AnalysisEngine {
  execute(input: {
    readonly context: ReadyAnalysisContext;
    readonly plan: AnalysisPlanContract;
    readonly content: AsyncIterable<Uint8Array>;
  }): Promise<AnalysisExecutionResult>;
}
