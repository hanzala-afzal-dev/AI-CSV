import { DomainError } from "../shared/domain-error";

export const reasoningEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export class ProviderModelId {
  private constructor(private readonly value: string) {}

  public static create(value: string): ProviderModelId {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
      throw new DomainError(
        "PROVIDER_MODEL_ID_INVALID",
        "Provider model identifier is invalid."
      );
    }
    return new ProviderModelId(value);
  }

  public toString(): string {
    return this.value;
  }
}

export class ProviderPreference {
  private constructor(
    public readonly modelId: ProviderModelId,
    public readonly reasoningEffort: ReasoningEffort
  ) {}

  public static create(input: {
    readonly modelId: string;
    readonly reasoningEffort: string;
    readonly allowedReasoningEfforts: readonly ReasoningEffort[];
  }): ProviderPreference {
    const reasoningEffort = reasoningEfforts.find(
      (candidate) => candidate === input.reasoningEffort
    );
    if (!reasoningEffort || !input.allowedReasoningEfforts.includes(reasoningEffort)) {
      throw new DomainError(
        "PROVIDER_REASONING_EFFORT_INVALID",
        "Reasoning effort is not supported by the selected model."
      );
    }
    return new ProviderPreference(ProviderModelId.create(input.modelId), reasoningEffort);
  }
}
