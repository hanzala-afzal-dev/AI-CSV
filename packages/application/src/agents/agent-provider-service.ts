import {
  ProviderModelId,
  reasoningEfforts,
  type ReasoningEffort
} from "@agentic-csv/domain";
import type { CredentialCipher, ProviderSettingsRepository } from "../providers/ports";
import { AgentError } from "./agent-error";
import type { AgentModelGateway, AgentModelSession } from "./ports";

export interface AgentModelSelection {
  readonly modelId: string | null;
  readonly reasoningEffort: string | null;
}

export class AgentProviderService {
  public constructor(
    private readonly repository: ProviderSettingsRepository,
    private readonly cipher: CredentialCipher,
    private readonly gateway: AgentModelGateway
  ) {}

  public async withSession<TResult>(
    userId: string,
    selection: AgentModelSelection,
    work: (session: AgentModelSession) => Promise<TResult>
  ): Promise<TResult> {
    const [settings, credential] = await Promise.all([
      this.repository.getSettings(userId),
      this.repository.getEncryptedCredential(userId)
    ]);
    if (!credential || credential.status !== "valid" || !settings.preference) {
      throw new AgentError(
        "AGENT_PROVIDER_AUTH_FAILED",
        "Connect and validate an OpenAI credential before starting analysis."
      );
    }
    const selected =
      selection.modelId !== null && selection.reasoningEffort !== null
        ? {
            modelId: selection.modelId,
            reasoningEffort: selection.reasoningEffort
          }
        : settings.preference;
    const modelId = selected.modelId;
    const reasoningEffort = asReasoningEffort(selected.reasoningEffort);
    try {
      ProviderModelId.create(modelId);
    } catch {
      throw new AgentError(
        "AGENT_PROVIDER_CONFIGURATION_INVALID",
        "The model selected for this run is invalid."
      );
    }
    const secret = this.cipher.decrypt(credential, {
      credentialId: credential.id,
      userId,
      provider: credential.provider
    });
    const session: AgentModelSession = {
      modelId,
      reasoningEffort,
      createPlan: (request) =>
        this.gateway.createPlan({
          secret,
          modelId,
          reasoningEffort,
          request
        }),
      createExplanation: (request) =>
        this.gateway.createExplanation({
          secret,
          modelId,
          reasoningEffort,
          request
        })
    };
    try {
      return await work(session);
    } finally {
      secret.destroy();
    }
  }
}

function asReasoningEffort(value: string): ReasoningEffort {
  const effort = reasoningEfforts.find((candidate) => candidate === value);
  if (!effort) {
    throw new AgentError(
      "AGENT_PROVIDER_CONFIGURATION_INVALID",
      "The reasoning effort selected for this run is invalid."
    );
  }
  return effort;
}
