export type AgentErrorCode =
  | "AGENT_CANCELLED"
  | "AGENT_CHECKPOINT_INVALID"
  | "AGENT_DATASET_NOT_READY"
  | "AGENT_LIMIT_EXCEEDED"
  | "AGENT_PROVIDER_AUTH_FAILED"
  | "AGENT_PROVIDER_CONFIGURATION_INVALID"
  | "AGENT_PROVIDER_RATE_LIMITED"
  | "AGENT_PROVIDER_TIMEOUT"
  | "AGENT_PROVIDER_UNAVAILABLE"
  | "AGENT_PROVIDER_OUTPUT_INVALID"
  | "ANALYSIS_PLAN_UNRESOLVED";

export class AgentError extends Error {
  public constructor(
    public readonly code: AgentErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "AgentError";
  }
}
