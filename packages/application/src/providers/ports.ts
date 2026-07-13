import type { ReasoningEffort } from "@agentic-csv/domain";
import type { SecretValue } from "./secret-value";

export type AiProvider = "openai";
export type StoredCredentialStatus = "valid" | "invalid";
export type ProviderValidationOperation = "credential_revalidate" | "preference_update";

export interface ProviderModel {
  readonly id: string;
  readonly reasoningEfforts: readonly ReasoningEffort[];
}

export interface CredentialValidationResult {
  readonly models: readonly ProviderModel[];
}

export interface AiProviderGateway {
  validateCredential(secret: SecretValue): Promise<CredentialValidationResult>;
  listCompatibleModels(secret: SecretValue): Promise<readonly ProviderModel[]>;
}

export interface CredentialEncryptionContext {
  readonly credentialId: string;
  readonly userId: string;
  readonly provider: AiProvider;
}

export interface EncryptedSecretMaterial {
  readonly ciphertext: string;
  readonly nonce: string;
  readonly authTag: string;
  readonly algorithm: "AES-256-GCM";
  readonly keyVersion: string;
  readonly fingerprint: string;
}

export interface CredentialCipher {
  encrypt(
    secret: SecretValue,
    context: CredentialEncryptionContext
  ): EncryptedSecretMaterial;
  decrypt(
    encrypted: EncryptedSecretMaterial,
    context: CredentialEncryptionContext
  ): SecretValue;
}

export interface StoredEncryptedCredential extends EncryptedSecretMaterial {
  readonly id: string;
  readonly userId: string;
  readonly provider: AiProvider;
  readonly last4: string;
  readonly status: StoredCredentialStatus;
  readonly validatedAt: Date | null;
  readonly updatedAt: Date;
}

export interface StoredCredentialSummary {
  readonly id: string;
  readonly last4: string;
  readonly status: StoredCredentialStatus;
  readonly validatedAt: Date | null;
  readonly updatedAt: Date;
}

export interface StoredProviderPreference {
  readonly modelId: string;
  readonly reasoningEffort: ReasoningEffort;
  readonly reasoningMode: string | null;
  readonly modelValidatedAt: Date;
}

export interface ProviderSettingsSnapshot {
  readonly credential: StoredCredentialSummary | null;
  readonly preference: StoredProviderPreference | null;
}

export type SecurityAuditEventType =
  | "provider.credential.added"
  | "provider.credential.replaced"
  | "provider.credential.validation_succeeded"
  | "provider.credential.validation_failed"
  | "provider.credential.deleted"
  | "provider.preferences.fallback_applied"
  | "provider.preferences.updated";

export interface SecurityAuditInput {
  readonly userId: string;
  readonly eventType: SecurityAuditEventType;
  readonly outcome: "success" | "failure";
  readonly subjectId: string | null;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | boolean | null>>;
  readonly occurredAt: Date;
}

export interface ProviderSettingsRepository {
  getSettings(userId: string): Promise<ProviderSettingsSnapshot>;
  getEncryptedCredential(userId: string): Promise<StoredEncryptedCredential | null>;
  replaceCredential(input: {
    readonly userId: string;
    readonly credentialId: string;
    readonly provider: AiProvider;
    readonly encrypted: EncryptedSecretMaterial;
    readonly last4: string;
    readonly validatedAt: Date;
    readonly preference: StoredProviderPreference | null;
    readonly fallbackApplied: boolean;
    readonly correlationId: string;
  }): Promise<ProviderSettingsSnapshot>;
  updateValidation(input: {
    readonly userId: string;
    readonly credentialId: string;
    readonly status: StoredCredentialStatus;
    readonly validatedAt: Date | null;
    readonly outcome: "success" | "failure";
    readonly failureCode: string | null;
    readonly operation: ProviderValidationOperation;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<ProviderSettingsSnapshot>;
  deleteCredential(input: {
    readonly userId: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<ProviderSettingsSnapshot>;
  savePreference(input: {
    readonly userId: string;
    readonly credentialId: string;
    readonly preference: StoredProviderPreference;
    readonly correlationId: string;
    readonly occurredAt: Date;
  }): Promise<ProviderSettingsSnapshot>;
  recordAudit(input: SecurityAuditInput): Promise<void>;
}
