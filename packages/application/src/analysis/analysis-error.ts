export type AnalysisErrorCode =
  | "ANALYSIS_INVALID_PLAN"
  | "ANALYSIS_SOURCE_MISSING"
  | "ANALYSIS_SOURCE_UNAVAILABLE"
  | "ANALYSIS_SOURCE_CHANGED"
  | "ANALYSIS_SCAN_LIMIT_EXCEEDED"
  | "ANALYSIS_TIMEOUT"
  | "ANALYSIS_RESULT_LIMIT_EXCEEDED"
  | "ANALYSIS_EXECUTION_FAILED";

export class AnalysisError extends Error {
  public constructor(
    public readonly code: AnalysisErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
