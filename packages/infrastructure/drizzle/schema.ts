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

export const owners = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
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
    index("api_keys_owner_active_idx").on(table.ownerId, table.revokedAt)
  ]
);

export const datasetStatusEnum = pgEnum("dataset_status", [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed"
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
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
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
    index("datasets_owner_status_idx").on(table.ownerId, table.status),
    index("datasets_deleted_at_idx").on(table.deletedAt),
    uniqueIndex("datasets_owner_object_key_unique").on(table.ownerId, table.objectKey)
  ]
);

export const datasetUploadIntents = pgTable(
  "dataset_upload_intents",
  {
    id: uuid("id").primaryKey(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
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
    index("dataset_upload_intents_owner_idx").on(table.ownerId)
  ]
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    operation: varchar("operation", { length: 80 }).notNull(),
    key: varchar("key", { length: 200 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    response: jsonb("response"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("idempotency_owner_operation_key_unique").on(
      table.ownerId,
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
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    version: integer("version").notNull(),
    schemaProfile: jsonb("schema_profile").notNull(),
    statisticalProfile: jsonb("statistical_profile").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("dataset_versions_dataset_version_unique").on(
      table.datasetId,
      table.version
    ),
    index("dataset_versions_dataset_active_idx").on(table.datasetId, table.active)
  ]
);

export const analysisThreads = pgTable(
  "analysis_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    title: varchar("title", { length: 160 }).notNull(),
    langGraphThreadId: varchar("lang_graph_thread_id", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("analysis_threads_owner_dataset_idx").on(table.ownerId, table.datasetId),
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
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
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
