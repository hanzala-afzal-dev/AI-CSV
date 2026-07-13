import { randomUUID } from "node:crypto";
import { ProviderPreference, type ReasoningEffort } from "@agentic-csv/domain";
import { ProviderError } from "./provider-error";
import type {
  AiProviderGateway,
  CredentialCipher,
  ProviderModel,
  ProviderSettingsRepository,
  ProviderSettingsSnapshot,
  SecurityAuditInput,
  StoredEncryptedCredential,
  StoredProviderPreference
} from "./ports";
import { SecretValue } from "./secret-value";

export interface ProviderCredentialSummary {
  readonly provider: "openai";
  readonly configured: boolean;
  readonly last4: string | null;
  readonly status: "unconfigured" | "valid" | "invalid";
  readonly validatedAt: Date | null;
  readonly updatedAt: Date | null;
}

export interface ProviderSettingsView {
  readonly credential: ProviderCredentialSummary;
  readonly preference: StoredProviderPreference | null;
}

export interface ProviderSettingsResult {
  readonly settings: ProviderSettingsView;
  readonly models: readonly ProviderModel[];
}

export interface ProviderSettingsPolicy {
  readonly defaultModel: string;
  readonly defaultReasoningEffort: ReasoningEffort;
}

export class ProviderSettingsService {
  public constructor(
    private readonly repository: ProviderSettingsRepository,
    private readonly cipher: CredentialCipher,
    private readonly gateway: AiProviderGateway,
    private readonly policy: ProviderSettingsPolicy,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID
  ) {}

  public async getSettings(userId: string): Promise<ProviderSettingsView> {
    return toView(await this.repository.getSettings(userId));
  }

  public async saveCredential(input: {
    readonly userId: string;
    readonly apiKey: string;
    readonly correlationId: string;
  }): Promise<ProviderSettingsResult> {
    const secret = SecretValue.create(input.apiKey);
    try {
      const validation = await this.validateSubmittedSecret(
        input.userId,
        secret,
        input.correlationId
      );
      const credentialId = this.createId();
      const validatedAt = this.now();
      const selected = selectInitialPreference(
        validation.models,
        this.policy,
        validatedAt
      );
      const encrypted = this.cipher.encrypt(secret, {
        credentialId,
        userId: input.userId,
        provider: "openai"
      });
      const snapshot = await this.repository.replaceCredential({
        userId: input.userId,
        credentialId,
        provider: "openai",
        encrypted,
        last4: secret.lastCharacters(4),
        validatedAt,
        preference: selected.preference,
        fallbackApplied: selected.fallbackApplied,
        correlationId: input.correlationId
      });
      return { settings: toView(snapshot), models: validation.models };
    } finally {
      secret.destroy();
    }
  }

  public async revalidateCredential(input: {
    readonly userId: string;
    readonly correlationId: string;
  }): Promise<ProviderSettingsResult> {
    const stored = await this.requireCredential(input.userId);
    const secret = this.decrypt(stored);
    try {
      try {
        const result = await this.gateway.validateCredential(secret);
        const occurredAt = this.now();
        const snapshot = await this.repository.updateValidation({
          userId: input.userId,
          credentialId: stored.id,
          status: "valid",
          validatedAt: occurredAt,
          outcome: "success",
          failureCode: null,
          operation: "credential_revalidate",
          correlationId: input.correlationId,
          occurredAt
        });
        return { settings: toView(snapshot), models: result.models };
      } catch (error) {
        await this.recordValidationFailure(
          input.userId,
          stored,
          error,
          input.correlationId,
          "credential_revalidate"
        );
        throw error;
      }
    } finally {
      secret.destroy();
    }
  }

  public async listModels(input: {
    readonly userId: string;
    readonly correlationId: string;
  }): Promise<readonly ProviderModel[]> {
    const stored = await this.requireCredential(input.userId);
    const secret = this.decrypt(stored);
    try {
      try {
        return await this.gateway.listCompatibleModels(secret);
      } catch (error) {
        await this.recordAudit({
          userId: input.userId,
          eventType: "provider.credential.validation_failed",
          outcome: "failure",
          subjectId: stored.id,
          correlationId: input.correlationId,
          metadata: { operation: "model_catalog", code: safeErrorCode(error) },
          occurredAt: this.now()
        });
        throw error;
      }
    } finally {
      secret.destroy();
    }
  }

  public async updatePreference(input: {
    readonly userId: string;
    readonly modelId: string;
    readonly reasoningEffort: string;
    readonly correlationId: string;
  }): Promise<ProviderSettingsResult> {
    const stored = await this.requireCredential(input.userId);
    const secret = this.decrypt(stored);
    try {
      let models: readonly ProviderModel[];
      try {
        models = await this.gateway.listCompatibleModels(secret);
      } catch (error) {
        await this.recordValidationFailure(
          input.userId,
          stored,
          error,
          input.correlationId,
          "preference_update"
        );
        throw error;
      }
      const model = models.find((candidate) => candidate.id === input.modelId);
      if (!model) {
        throw new ProviderError(
          "PROVIDER_MODEL_UNAVAILABLE",
          "The selected model is not available to this OpenAI account."
        );
      }
      let preference: ProviderPreference;
      try {
        preference = ProviderPreference.create({
          modelId: input.modelId,
          reasoningEffort: input.reasoningEffort,
          allowedReasoningEfforts: model.reasoningEfforts
        });
      } catch {
        throw new ProviderError(
          "PROVIDER_REASONING_UNSUPPORTED",
          "The selected reasoning effort is not supported by this model."
        );
      }
      const occurredAt = this.now();
      const storedPreference: StoredProviderPreference = {
        modelId: preference.modelId.toString(),
        reasoningEffort: preference.reasoningEffort,
        reasoningMode: null,
        modelValidatedAt: occurredAt
      };
      const snapshot = await this.repository.savePreference({
        userId: input.userId,
        credentialId: stored.id,
        preference: storedPreference,
        correlationId: input.correlationId,
        occurredAt
      });
      return { settings: toView(snapshot), models };
    } finally {
      secret.destroy();
    }
  }

  public async deleteCredential(input: {
    readonly userId: string;
    readonly correlationId: string;
  }): Promise<ProviderSettingsView> {
    return toView(
      await this.repository.deleteCredential({
        userId: input.userId,
        correlationId: input.correlationId,
        occurredAt: this.now()
      })
    );
  }

  private async validateSubmittedSecret(
    userId: string,
    secret: SecretValue,
    correlationId: string
  ) {
    try {
      return await this.gateway.validateCredential(secret);
    } catch (error) {
      await this.recordAudit({
        userId,
        eventType: "provider.credential.validation_failed",
        outcome: "failure",
        subjectId: null,
        correlationId,
        metadata: { operation: "credential_save", code: safeErrorCode(error) },
        occurredAt: this.now()
      });
      throw error;
    }
  }

  private async requireCredential(userId: string): Promise<StoredEncryptedCredential> {
    const credential = await this.repository.getEncryptedCredential(userId);
    if (!credential) {
      throw new ProviderError(
        "PROVIDER_CREDENTIAL_NOT_CONFIGURED",
        "Configure an OpenAI API key before using provider settings."
      );
    }
    return credential;
  }

  private decrypt(credential: StoredEncryptedCredential): SecretValue {
    return this.cipher.decrypt(credential, {
      credentialId: credential.id,
      userId: credential.userId,
      provider: credential.provider
    });
  }

  private async recordValidationFailure(
    userId: string,
    credential: StoredEncryptedCredential,
    error: unknown,
    correlationId: string,
    operation: "credential_revalidate" | "preference_update"
  ): Promise<void> {
    const occurredAt = this.now();
    if (error instanceof ProviderError && error.code === "PROVIDER_KEY_INVALID") {
      await this.repository.updateValidation({
        userId,
        credentialId: credential.id,
        status: "invalid",
        validatedAt: null,
        outcome: "failure",
        failureCode: error.code,
        operation,
        correlationId,
        occurredAt
      });
      return;
    }
    await this.recordAudit({
      userId,
      eventType: "provider.credential.validation_failed",
      outcome: "failure",
      subjectId: credential.id,
      correlationId,
      metadata: { operation, code: safeErrorCode(error) },
      occurredAt
    });
  }

  private recordAudit(input: SecurityAuditInput): Promise<void> {
    return this.repository.recordAudit(input);
  }
}

function selectInitialPreference(
  models: readonly ProviderModel[],
  policy: ProviderSettingsPolicy,
  validatedAt: Date
): {
  readonly preference: StoredProviderPreference | null;
  readonly fallbackApplied: boolean;
} {
  if (models.length === 0) {
    return { preference: null, fallbackApplied: false };
  }
  const requested = models.find((model) => model.id === policy.defaultModel);
  const model = requested ?? models[0];
  if (!model) return { preference: null, fallbackApplied: false };
  const effort = model.reasoningEfforts.includes(policy.defaultReasoningEffort)
    ? policy.defaultReasoningEffort
    : model.reasoningEfforts[0];
  if (!effort) return { preference: null, fallbackApplied: false };
  return {
    preference: {
      modelId: model.id,
      reasoningEffort: effort,
      reasoningMode: null,
      modelValidatedAt: validatedAt
    },
    fallbackApplied:
      model.id !== policy.defaultModel || effort !== policy.defaultReasoningEffort
  };
}

function toView(snapshot: ProviderSettingsSnapshot): ProviderSettingsView {
  return {
    credential: snapshot.credential
      ? {
          provider: "openai",
          configured: true,
          last4: snapshot.credential.last4,
          status: snapshot.credential.status,
          validatedAt: snapshot.credential.validatedAt,
          updatedAt: snapshot.credential.updatedAt
        }
      : {
          provider: "openai",
          configured: false,
          last4: null,
          status: "unconfigured",
          validatedAt: null,
          updatedAt: null
        },
    preference: snapshot.preference
  };
}

function safeErrorCode(error: unknown): string {
  return error instanceof ProviderError ? error.code : "INTERNAL_ERROR";
}
