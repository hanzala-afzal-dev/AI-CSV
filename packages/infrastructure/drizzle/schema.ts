import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).unique(),
    pendingEmail: varchar("pending_email", { length: 320 }),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull().default("api_only"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("users_email_normalized_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    check(
      "users_email_normalized_check",
      sql`${table.email} is null or ${table.email} = lower(btrim(${table.email}))`
    ),
    check(
      "users_pending_email_normalized_check",
      sql`${table.pendingEmail} is null or ${table.pendingEmail} = lower(btrim(${table.pendingEmail}))`
    )
  ]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 24 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_user_active_idx").on(table.userId, table.revokedAt)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedFromId: uuid("rotated_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_active_idx").on(table.userId, table.revokedAt),
    index("sessions_expiry_idx").on(table.absoluteExpiresAt),
    check(
      "sessions_expiry_order_check",
      sql`${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`
    )
  ]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    pendingEmail: varchar("pending_email", { length: 320 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("verification_tokens_hash_unique").on(table.tokenHash),
    index("verification_tokens_user_purpose_idx").on(table.userId, table.purpose),
    index("verification_tokens_expiry_idx").on(table.expiresAt),
    check(
      "verification_tokens_purpose_check",
      sql`${table.purpose} in ('initial', 'email_change')`
    )
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
    index("password_reset_tokens_expiry_idx").on(table.expiresAt)
  ]
);

export const providerCredentialStatusEnum = pgEnum("provider_credential_status", [
  "valid",
  "invalid"
]);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: varchar("nonce", { length: 24 }).notNull(),
    authTag: varchar("auth_tag", { length: 24 }).notNull(),
    encryptedDataKey: text("encrypted_data_key"),
    algorithm: varchar("algorithm", { length: 32 }).notNull(),
    keyVersion: varchar("key_version", { length: 64 }).notNull(),
    last4: varchar("last4", { length: 4 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    status: providerCredentialStatusEnum("status").notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("provider_credentials_user_provider_unique").on(
      table.userId,
      table.provider
    ),
    index("provider_credentials_user_status_idx").on(table.userId, table.status),
    check("provider_credentials_provider_check", sql`${table.provider} = 'openai'`),
    check(
      "provider_credentials_algorithm_check",
      sql`${table.algorithm} = 'AES-256-GCM'`
    ),
    check("provider_credentials_last4_check", sql`char_length(${table.last4}) = 4`),
    check(
      "provider_credentials_nonce_check",
      sql`char_length(${table.nonce}) = 16 and ${table.nonce} ~ '^[A-Za-z0-9+/]{16}$'`
    ),
    check(
      "provider_credentials_auth_tag_check",
      sql`char_length(${table.authTag}) = 24 and ${table.authTag} ~ '^[A-Za-z0-9+/]{22}==$'`
    ),
    check(
      "provider_credentials_fingerprint_check",
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "provider_credentials_key_version_check",
      sql`${table.keyVersion} ~ '^[A-Za-z0-9._-]{1,64}$'`
    )
  ]
);

export const providerPreferences = pgTable(
  "provider_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    reasoningEffort: varchar("reasoning_effort", { length: 32 }).notNull(),
    reasoningMode: varchar("reasoning_mode", { length: 64 }),
    modelValidatedAt: timestamp("model_validated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    check("provider_preferences_provider_check", sql`${table.provider} = 'openai'`),
    check(
      "provider_preferences_model_id_check",
      sql`${table.modelId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'`
    ),
    check(
      "provider_preferences_reasoning_effort_check",
      sql`${table.reasoningEffort} in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')`
    )
  ]
);

export const securityAuditEvents = pgTable(
  "security_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    subjectType: varchar("subject_type", { length: 80 }).notNull(),
    subjectId: uuid("subject_id"),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("security_audit_events_user_occurred_idx").on(table.userId, table.occurredAt),
    check(
      "security_audit_events_outcome_check",
      sql`${table.outcome} in ('success', 'failure')`
    ),
    check(
      "security_audit_events_event_type_check",
      sql`${table.eventType} in ('provider.credential.added', 'provider.credential.replaced', 'provider.credential.validation_succeeded', 'provider.credential.validation_failed', 'provider.credential.deleted', 'provider.preferences.fallback_applied', 'provider.preferences.updated')`
    ),
    check(
      "security_audit_events_subject_type_check",
      sql`${table.subjectType} = 'provider_credential'`
    ),
    check(
      "security_audit_events_metadata_keys_check",
      sql`jsonb_typeof(${table.metadata}) = 'object' and (${table.metadata} - array['provider','operation','code','fallbackApplied','modelId','reasoningEffort']::text[]) = '{}'::jsonb`
    )
  ]
);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived"
]);

export const conversationMessageRoleEnum = pgEnum("conversation_message_role", [
  "user",
  "assistant",
  "system_event",
  "tool"
]);

export const conversationMessageStatusEnum = pgEnum("conversation_message_status", [
  "streaming",
  "final",
  "failed"
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "waiting_for_user",
  "completed",
  "failed",
  "cancelled"
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    status: conversationStatusEnum("status").notNull().default("active"),
    activeDatasetId: uuid("active_dataset_id"),
    activeDatasetVersionId: uuid("active_dataset_version_id"),
    lastMessageSequence: integer("last_message_sequence").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("conversations_user_id_id_unique").on(table.userId, table.id),
    index("conversations_user_status_activity_idx").on(
      table.userId,
      table.status,
      table.lastActivityAt.desc(),
      table.id.desc()
    ),
    check(
      "conversations_title_check",
      sql`char_length(btrim(${table.title})) between 1 and 120 and ${table.title} = btrim(${table.title})`
    ),
    check("conversations_sequence_check", sql`${table.lastMessageSequence} >= 0`),
    check("conversations_version_check", sql`${table.version} > 0`),
    check(
      "conversations_active_dataset_check",
      sql`(${table.activeDatasetId} is null and ${table.activeDatasetVersionId} is null)
        or (${table.activeDatasetId} is not null and ${table.activeDatasetVersionId} is not null)`
    ),
    foreignKey({
      name: "conversations_active_dataset_fk",
      columns: [table.userId, table.activeDatasetId],
      foreignColumns: [datasets.userId, datasets.id]
    }),
    foreignKey({
      name: "conversations_active_dataset_version_fk",
      columns: [table.userId, table.activeDatasetId, table.activeDatasetVersionId],
      foreignColumns: [
        datasetVersions.userId,
        datasetVersions.datasetId,
        datasetVersions.id
      ]
    })
  ]
);

export const conversationMessages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    sequence: integer("sequence").notNull(),
    role: conversationMessageRoleEnum("role").notNull(),
    status: conversationMessageStatusEnum("status").notNull(),
    contentParts: jsonb("content_parts").notNull(),
    providerResponseReference: varchar("provider_response_reference", { length: 255 }),
    usageMetadata: jsonb("usage_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("messages_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence
    ),
    uniqueIndex("messages_user_conversation_id_unique").on(
      table.userId,
      table.conversationId,
      table.id
    ),
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    foreignKey({
      name: "messages_user_conversation_fk",
      columns: [table.userId, table.conversationId],
      foreignColumns: [conversations.userId, conversations.id]
    }).onDelete("cascade"),
    check("messages_sequence_check", sql`${table.sequence} > 0`),
    check(
      "messages_content_parts_check",
      sql`jsonb_typeof(${table.contentParts}) = 'object'
        and ${table.contentParts}->>'version' = '1'
        and jsonb_typeof(${table.contentParts}->'parts') = 'array'
        and jsonb_array_length(${table.contentParts}->'parts') between 1 and 16`
    ),
    check(
      "messages_finalized_at_check",
      sql`(${table.status} = 'streaming' and ${table.finalizedAt} is null)
        or (${table.status} in ('final', 'failed') and ${table.finalizedAt} is not null)`
    )
  ]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    userMessageId: uuid("user_message_id").notNull(),
    status: agentRunStatusEnum("status").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    selectedModel: varchar("selected_model", { length: 200 }),
    selectedReasoningEffort: varchar("selected_reasoning_effort", { length: 32 }),
    stepCount: integer("step_count").notNull().default(0),
    repairCount: integer("repair_count").notNull().default(0),
    failureCode: varchar("failure_code", { length: 80 }),
    failureMessage: varchar("failure_message", { length: 500 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("agent_runs_user_client_request_unique").on(
      table.userId,
      table.clientRequestId
    ),
    uniqueIndex("agent_runs_user_conversation_id_unique").on(
      table.userId,
      table.conversationId,
      table.id
    ),
    uniqueIndex("agent_runs_one_active_per_conversation_unique")
      .on(table.conversationId)
      .where(sql`${table.status} in ('queued', 'running', 'waiting_for_user')`),
    index("agent_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    foreignKey({
      name: "agent_runs_user_conversation_fk",
      columns: [table.userId, table.conversationId],
      foreignColumns: [conversations.userId, conversations.id]
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_runs_user_conversation_message_fk",
      columns: [table.userId, table.conversationId, table.userMessageId],
      foreignColumns: [
        conversationMessages.userId,
        conversationMessages.conversationId,
        conversationMessages.id
      ]
    }).onDelete("cascade"),
    check(
      "agent_runs_count_check",
      sql`${table.stepCount} >= 0 and ${table.repairCount} >= 0`
    ),
    check(
      "agent_runs_terminal_timestamp_check",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null)
        or (${table.status} = 'cancelled' and ${table.cancelledAt} is not null)
        or (${table.status} in ('queued', 'running', 'waiting_for_user', 'failed'))`
    )
  ]
);

export const runEvents = pgTable(
  "run_events",
  {
    runId: uuid("run_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    sequence: integer("sequence").notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sequence] }),
    index("run_events_user_run_sequence_idx").on(
      table.userId,
      table.runId,
      table.sequence
    ),
    foreignKey({
      name: "run_events_user_conversation_run_fk",
      columns: [table.userId, table.conversationId, table.runId],
      foreignColumns: [agentRuns.userId, agentRuns.conversationId, agentRuns.id]
    }).onDelete("cascade"),
    check("run_events_sequence_check", sql`${table.sequence} > 0`),
    check(
      "run_events_type_check",
      sql`${table.eventType} in ('run.queued', 'run.started', 'assistant.delta', 'run.completed', 'run.failed', 'run.cancelled')`
    ),
    check(
      "run_events_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object' and ${table.payload}->>'version' = '1'`
    )
  ]
);

export const datasetStatusEnum = pgEnum("dataset_status", [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed",
  "deleting"
]);

export const datasetVersionStatusEnum = pgEnum("dataset_version_status", [
  "pending_upload",
  "uploaded",
  "queued",
  "validating",
  "profiling",
  "indexing",
  "ready",
  "failed",
  "deleting",
  "deleted"
]);

export const messageRoleEnum = pgEnum("analysis_message_role", [
  "user",
  "assistant",
  "tool",
  "system"
]);

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    objectKey: text("object_key"),
    status: datasetStatusEnum("status").notNull().default("pending_upload"),
    rowCount: integer("row_count"),
    columnCount: integer("column_count"),
    failureReason: text("failure_reason"),
    activeVersionId: uuid("active_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    index("datasets_user_status_idx").on(table.userId, table.status),
    index("datasets_deleted_at_idx").on(table.deletedAt),
    uniqueIndex("datasets_user_object_key_unique").on(table.userId, table.objectKey)
  ]
);

export const datasetUploadIntents = pgTable(
  "dataset_upload_intents",
  {
    id: uuid("id").primaryKey(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    datasetVersionId: uuid("dataset_version_id"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 44 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("dataset_upload_intents_object_key_unique").on(table.objectKey),
    index("dataset_upload_intents_dataset_created_idx").on(
      table.datasetId,
      table.createdAt
    ),
    index("dataset_upload_intents_user_idx").on(table.userId)
  ]
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: varchar("operation", { length: 80 }).notNull(),
    key: varchar("key", { length: 200 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    response: jsonb("response"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("idempotency_user_operation_key_unique").on(
      table.userId,
      table.operation,
      table.key
    ),
    index("idempotency_expires_at_idx").on(table.expiresAt)
  ]
);

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    versionNumber: integer("version_number").notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    encoding: varchar("encoding", { length: 40 }),
    delimiter: varchar("delimiter", { length: 8 }),
    objectKey: text("object_key").notNull(),
    normalizedObjectKey: text("normalized_object_key"),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    normalizedChecksum: varchar("normalized_checksum", { length: 128 }),
    status: datasetVersionStatusEnum("status").notNull().default("pending_upload"),
    failureCode: varchar("failure_code", { length: 80 }),
    rowCount: integer("row_count"),
    columnCount: integer("column_count"),
    profileVersion: integer("profile_version"),
    schemaProfile: jsonb("schema_profile"),
    statisticalProfile: jsonb("statistical_profile"),
    active: boolean("active").notNull().default(true),
    ingestionClaimId: varchar("ingestion_claim_id", { length: 128 }),
    ingestionClaimedAt: timestamp("ingestion_claimed_at", { withTimezone: true }),
    ingestionAttempt: integer("ingestion_attempt").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("dataset_versions_dataset_version_unique").on(
      table.datasetId,
      table.versionNumber
    ),
    uniqueIndex("dataset_versions_user_dataset_id_unique").on(
      table.userId,
      table.datasetId,
      table.id
    ),
    index("dataset_versions_user_status_idx").on(table.userId, table.status),
    index("dataset_versions_dataset_active_idx").on(table.datasetId, table.active),
    check(
      "dataset_versions_counts_check",
      sql`(${table.rowCount} is null or ${table.rowCount} >= 0)
        and (${table.columnCount} is null or ${table.columnCount} > 0)
        and (${table.profileVersion} is null or ${table.profileVersion} > 0)
        and ${table.ingestionAttempt} >= 0`
    ),
    check(
      "dataset_versions_claim_check",
      sql`(${table.ingestionClaimId} is null and ${table.ingestionClaimedAt} is null)
        or (${table.ingestionClaimId} is not null and ${table.ingestionClaimedAt} is not null)`
    )
  ]
);

export const datasetColumns = pgTable(
  "dataset_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull(),
    datasetVersionId: uuid("dataset_version_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    originalName: varchar("original_name", { length: 500 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 160 }).notNull(),
    inferredType: varchar("inferred_type", { length: 32 }).notNull(),
    semanticType: varchar("semantic_type", { length: 32 }).notNull(),
    nullable: boolean("nullable").notNull(),
    statistics: jsonb("statistics").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("dataset_columns_version_ordinal_unique").on(
      table.datasetVersionId,
      table.ordinal
    ),
    uniqueIndex("dataset_columns_version_canonical_unique").on(
      table.datasetVersionId,
      table.canonicalName
    ),
    index("dataset_columns_user_version_idx").on(table.userId, table.datasetVersionId),
    foreignKey({
      name: "dataset_columns_user_dataset_version_fk",
      columns: [table.userId, table.datasetId, table.datasetVersionId],
      foreignColumns: [
        datasetVersions.userId,
        datasetVersions.datasetId,
        datasetVersions.id
      ]
    }).onDelete("cascade"),
    check("dataset_columns_ordinal_check", sql`${table.ordinal} >= 0`),
    check(
      "dataset_columns_inferred_type_check",
      sql`${table.inferredType} in ('integer', 'decimal', 'boolean', 'date', 'timestamp', 'text')`
    ),
    check(
      "dataset_columns_semantic_type_check",
      sql`${table.semanticType} in ('identifier', 'numeric', 'date', 'categorical', 'free_text')`
    ),
    check(
      "dataset_columns_statistics_check",
      sql`jsonb_typeof(${table.statistics}) = 'object' and ${table.statistics}->>'version' = '1'`
    )
  ]
);

export const datasetProfiles = pgTable(
  "dataset_profiles",
  {
    datasetVersionId: uuid("dataset_version_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull(),
    profile: jsonb("profile").notNull(),
    warnings: jsonb("warnings").notNull(),
    suggestedPrompts: jsonb("suggested_prompts").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("dataset_profiles_user_dataset_idx").on(table.userId, table.datasetId),
    foreignKey({
      name: "dataset_profiles_user_dataset_version_fk",
      columns: [table.userId, table.datasetId, table.datasetVersionId],
      foreignColumns: [
        datasetVersions.userId,
        datasetVersions.datasetId,
        datasetVersions.id
      ]
    }).onDelete("cascade"),
    check(
      "dataset_profiles_profile_check",
      sql`jsonb_typeof(${table.profile}) = 'object' and ${table.profile}->>'version' = '1'`
    ),
    check(
      "dataset_profiles_warnings_check",
      sql`jsonb_typeof(${table.warnings}) = 'array'`
    ),
    check(
      "dataset_profiles_suggestions_check",
      sql`jsonb_typeof(${table.suggestedPrompts}) = 'array'
        and jsonb_array_length(${table.suggestedPrompts}) between 3 and 6`
    )
  ]
);

export const analysisThreads = pgTable(
  "analysis_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    title: varchar("title", { length: 160 }).notNull(),
    langGraphThreadId: varchar("lang_graph_thread_id", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("analysis_threads_user_dataset_idx").on(table.userId, table.datasetId),
    uniqueIndex("analysis_threads_langgraph_thread_unique").on(table.langGraphThreadId)
  ]
);

export const analysisMessages = pgTable(
  "analysis_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => analysisThreads.id),
    role: messageRoleEnum("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("analysis_messages_thread_created_idx").on(table.threadId, table.createdAt)
  ]
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    eventId: uuid("event_id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    aggregateId: uuid("aggregate_id").notNull(),
    eventName: varchar("event_name", { length: 160 }).notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error")
  },
  (table) => [
    index("outbox_events_unpublished_idx").on(table.publishedAt, table.occurredAt),
    index("outbox_events_aggregate_idx").on(table.aggregateId)
  ]
);
