import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).unique(),
  pendingEmail: varchar("pending_email", { length: 320 }),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("api_only"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
    index("sessions_expiry_idx").on(table.absoluteExpiresAt)
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
    index("verification_tokens_expiry_idx").on(table.expiresAt)
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

export const datasetStatusEnum = pgEnum("dataset_status", [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed"
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("dataset_versions_dataset_version_unique").on(
      table.datasetId,
      table.versionNumber
    ),
    index("dataset_versions_user_status_idx").on(table.userId, table.status),
    index("dataset_versions_dataset_active_idx").on(table.datasetId, table.active)
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
