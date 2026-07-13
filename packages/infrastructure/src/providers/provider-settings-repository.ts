import { and, eq, sql } from "drizzle-orm";
import type {
  ProviderSettingsRepository,
  ProviderSettingsSnapshot,
  SecurityAuditInput,
  StoredEncryptedCredential
} from "@agentic-csv/application";
import { reasoningEfforts, type ReasoningEffort } from "@agentic-csv/domain";
import { providerCredentials, providerPreferences, users } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresProviderSettingsRepository implements ProviderSettingsRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public getSettings(userId: string): Promise<ProviderSettingsSnapshot> {
    return this.executeForUser(userId, (transaction) =>
      readSettings(transaction, userId)
    );
  }

  public getEncryptedCredential(
    userId: string
  ): Promise<StoredEncryptedCredential | null> {
    return this.executeForUser(userId, async (transaction) => {
      const result = await transaction.execute<EncryptedCredentialRow>(sql`
        select * from public.provider_get_credential_secret('openai')
      `);
      const row = result.rows[0];
      return row ? mapEncryptedCredential(row, userId) : null;
    });
  }

  public replaceCredential(
    input: Parameters<ProviderSettingsRepository["replaceCredential"]>[0]
  ): Promise<ProviderSettingsSnapshot> {
    return this.executeForUser(input.userId, async (transaction) => {
      await lockUser(transaction, input.userId);
      const previous = await transaction
        .select({ id: providerCredentials.id })
        .from(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, input.userId),
            eq(providerCredentials.provider, input.provider)
          )
        )
        .limit(1);
      await transaction
        .delete(providerPreferences)
        .where(
          and(
            eq(providerPreferences.userId, input.userId),
            eq(providerPreferences.provider, input.provider)
          )
        );
      await transaction
        .delete(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, input.userId),
            eq(providerCredentials.provider, input.provider)
          )
        );
      await transaction.insert(providerCredentials).values({
        id: input.credentialId,
        userId: input.userId,
        provider: input.provider,
        ciphertext: input.encrypted.ciphertext,
        nonce: input.encrypted.nonce,
        authTag: input.encrypted.authTag,
        algorithm: input.encrypted.algorithm,
        keyVersion: input.encrypted.keyVersion,
        last4: input.last4,
        fingerprint: input.encrypted.fingerprint,
        status: "valid",
        validatedAt: input.validatedAt,
        createdAt: input.validatedAt,
        updatedAt: input.validatedAt
      });
      if (input.preference) {
        await transaction.insert(providerPreferences).values({
          userId: input.userId,
          provider: input.provider,
          ...input.preference,
          createdAt: input.validatedAt,
          updatedAt: input.validatedAt
        });
      }
      await insertAudit(transaction, {
        userId: input.userId,
        eventType:
          previous.length > 0
            ? "provider.credential.replaced"
            : "provider.credential.added",
        outcome: "success",
        subjectId: input.credentialId,
        correlationId: input.correlationId,
        metadata: {
          provider: input.provider,
          fallbackApplied: input.fallbackApplied,
          modelId: input.preference?.modelId ?? null
        },
        occurredAt: input.validatedAt
      });
      if (input.fallbackApplied && input.preference) {
        await insertAudit(transaction, {
          userId: input.userId,
          eventType: "provider.preferences.fallback_applied",
          outcome: "success",
          subjectId: input.credentialId,
          correlationId: input.correlationId,
          metadata: {
            provider: input.provider,
            modelId: input.preference.modelId,
            reasoningEffort: input.preference.reasoningEffort
          },
          occurredAt: input.validatedAt
        });
      }
      return readSettings(transaction, input.userId);
    });
  }

  public updateValidation(
    input: Parameters<ProviderSettingsRepository["updateValidation"]>[0]
  ): Promise<ProviderSettingsSnapshot> {
    return this.executeForUser(input.userId, async (transaction) => {
      const updated = await transaction
        .update(providerCredentials)
        .set({
          status: input.status,
          validatedAt: input.validatedAt,
          updatedAt: input.occurredAt
        })
        .where(
          and(
            eq(providerCredentials.id, input.credentialId),
            eq(providerCredentials.userId, input.userId)
          )
        )
        .returning({ id: providerCredentials.id });
      if (updated.length === 0) {
        throw new Error("Provider credential is no longer configured.");
      }
      await insertAudit(transaction, {
        userId: input.userId,
        eventType:
          input.outcome === "success"
            ? "provider.credential.validation_succeeded"
            : "provider.credential.validation_failed",
        outcome: input.outcome,
        subjectId: input.credentialId,
        correlationId: input.correlationId,
        metadata: {
          provider: "openai",
          code: input.failureCode,
          operation: input.operation
        },
        occurredAt: input.occurredAt
      });
      return readSettings(transaction, input.userId);
    });
  }

  public deleteCredential(
    input: Parameters<ProviderSettingsRepository["deleteCredential"]>[0]
  ): Promise<ProviderSettingsSnapshot> {
    return this.executeForUser(input.userId, async (transaction) => {
      await lockUser(transaction, input.userId);
      const existing = await transaction
        .select({ id: providerCredentials.id })
        .from(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, input.userId),
            eq(providerCredentials.provider, "openai")
          )
        )
        .limit(1);
      await transaction
        .delete(providerPreferences)
        .where(
          and(
            eq(providerPreferences.userId, input.userId),
            eq(providerPreferences.provider, "openai")
          )
        );
      await transaction
        .delete(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, input.userId),
            eq(providerCredentials.provider, "openai")
          )
        );
      if (existing[0]) {
        await insertAudit(transaction, {
          userId: input.userId,
          eventType: "provider.credential.deleted",
          outcome: "success",
          subjectId: existing[0].id,
          correlationId: input.correlationId,
          metadata: { provider: "openai" },
          occurredAt: input.occurredAt
        });
      }
      return { credential: null, preference: null };
    });
  }

  public savePreference(
    input: Parameters<ProviderSettingsRepository["savePreference"]>[0]
  ): Promise<ProviderSettingsSnapshot> {
    return this.executeForUser(input.userId, async (transaction) => {
      const updated = await transaction
        .update(providerCredentials)
        .set({
          status: "valid",
          validatedAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .where(
          and(
            eq(providerCredentials.id, input.credentialId),
            eq(providerCredentials.userId, input.userId)
          )
        )
        .returning({ id: providerCredentials.id });
      if (updated.length === 0) {
        throw new Error("Provider credential is no longer configured.");
      }
      await transaction
        .insert(providerPreferences)
        .values({
          userId: input.userId,
          provider: "openai",
          ...input.preference,
          createdAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .onConflictDoUpdate({
          target: [providerPreferences.userId, providerPreferences.provider],
          set: {
            modelId: input.preference.modelId,
            reasoningEffort: input.preference.reasoningEffort,
            reasoningMode: input.preference.reasoningMode,
            modelValidatedAt: input.preference.modelValidatedAt,
            updatedAt: input.occurredAt
          }
        });
      await insertAudit(transaction, {
        userId: input.userId,
        eventType: "provider.preferences.updated",
        outcome: "success",
        subjectId: input.credentialId,
        correlationId: input.correlationId,
        metadata: {
          provider: "openai",
          modelId: input.preference.modelId,
          reasoningEffort: input.preference.reasoningEffort
        },
        occurredAt: input.occurredAt
      });
      return readSettings(transaction, input.userId);
    });
  }

  public recordAudit(input: SecurityAuditInput): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      await insertAudit(transaction, input);
    });
  }

  private executeForUser<TResult>(
    userId: string,
    work: (transaction: DatabaseTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_user_id', ${userId}, true)`
      );
      return work(transaction);
    });
  }
}

async function readSettings(
  transaction: DatabaseTransaction,
  userId: string
): Promise<ProviderSettingsSnapshot> {
  const credentials = await transaction
    .select({
      id: providerCredentials.id,
      last4: providerCredentials.last4,
      status: providerCredentials.status,
      validatedAt: providerCredentials.validatedAt,
      updatedAt: providerCredentials.updatedAt
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.provider, "openai")
      )
    )
    .limit(1);
  const preferences = await transaction
    .select({
      modelId: providerPreferences.modelId,
      reasoningEffort: providerPreferences.reasoningEffort,
      reasoningMode: providerPreferences.reasoningMode,
      modelValidatedAt: providerPreferences.modelValidatedAt
    })
    .from(providerPreferences)
    .where(
      and(
        eq(providerPreferences.userId, userId),
        eq(providerPreferences.provider, "openai")
      )
    )
    .limit(1);
  const credential = credentials[0] ?? null;
  const preference = preferences[0];
  return {
    credential,
    preference: preference
      ? {
          ...preference,
          reasoningEffort: asReasoningEffort(preference.reasoningEffort)
        }
      : null
  };
}

async function lockUser(transaction: DatabaseTransaction, userId: string) {
  const rows = await transaction
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  if (rows.length === 0) throw new Error("Provider settings user was not found.");
}

async function insertAudit(
  transaction: DatabaseTransaction,
  input: SecurityAuditInput
): Promise<void> {
  const metadata = JSON.stringify(safeAuditMetadata(input.metadata));
  await transaction.execute(sql`
    insert into security_audit_events (
      user_id,
      event_type,
      outcome,
      subject_type,
      subject_id,
      correlation_id,
      metadata,
      occurred_at
    ) values (
      ${input.userId},
      ${input.eventType},
      ${input.outcome},
      'provider_credential',
      ${input.subjectId},
      ${input.correlationId},
      ${metadata}::jsonb,
      ${input.occurredAt}
    )
  `);
}

const allowedAuditMetadata = new Set([
  "provider",
  "operation",
  "code",
  "fallbackApplied",
  "modelId",
  "reasoningEffort"
]);

function safeAuditMetadata(
  metadata: Readonly<Record<string, string | boolean | null>>
): Record<string, string | boolean | null> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (!allowedAuditMetadata.has(key)) {
        throw new Error("Security audit metadata key is not allowed.");
      }
      if (typeof value === "string" && value.length > 200) {
        throw new Error("Security audit metadata value is too long.");
      }
      return [key, value];
    })
  );
}

function asReasoningEffort(value: string): ReasoningEffort {
  const effort = reasoningEfforts.find((candidate) => candidate === value);
  if (!effort) throw new Error("Stored provider reasoning effort is invalid.");
  return effort;
}

interface EncryptedCredentialRow {
  [key: string]: unknown;
  id: string;
  provider: "openai";
  ciphertext: string;
  nonce: string;
  auth_tag: string;
  algorithm: "AES-256-GCM";
  key_version: string;
  fingerprint: string;
  last4: string;
  status: "valid" | "invalid";
  validated_at: Date | string | null;
  updated_at: Date | string;
}

function mapEncryptedCredential(
  row: EncryptedCredentialRow,
  userId: string
): StoredEncryptedCredential {
  return {
    id: row.id,
    userId,
    provider: row.provider,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authTag: row.auth_tag,
    algorithm: row.algorithm,
    keyVersion: row.key_version,
    fingerprint: row.fingerprint,
    last4: row.last4,
    status: row.status,
    validatedAt: row.validated_at ? databaseDate(row.validated_at) : null,
    updatedAt: databaseDate(row.updated_at)
  };
}

function databaseDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Provider settings contain an invalid timestamp.");
  }
  return date;
}
