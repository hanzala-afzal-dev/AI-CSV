CREATE TYPE "public"."dataset_status" AS ENUM('pending_upload', 'uploaded', 'profiling', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."analysis_message_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TABLE "analysis_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "analysis_message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"lang_graph_thread_id" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"key_prefix" varchar(24) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_upload_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(44) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_profile" jsonb NOT NULL,
	"statistical_profile" jsonb NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"object_key" text,
	"status" "dataset_status" DEFAULT 'pending_upload' NOT NULL,
	"row_count" integer,
	"column_count" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"key" varchar(200) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"aggregate_id" uuid NOT NULL,
	"event_name" varchar(160) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_messages" ADD CONSTRAINT "analysis_messages_thread_id_analysis_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."analysis_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_threads" ADD CONSTRAINT "analysis_threads_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_threads" ADD CONSTRAINT "analysis_threads_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ADD CONSTRAINT "dataset_upload_intents_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ADD CONSTRAINT "dataset_upload_intents_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_messages_thread_created_idx" ON "analysis_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_threads_owner_dataset_idx" ON "analysis_threads" USING btree ("owner_id","dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_threads_langgraph_thread_unique" ON "analysis_threads" USING btree ("lang_graph_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_owner_active_idx" ON "api_keys" USING btree ("owner_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_upload_intents_object_key_unique" ON "dataset_upload_intents" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "dataset_upload_intents_dataset_created_idx" ON "dataset_upload_intents" USING btree ("dataset_id","created_at");--> statement-breakpoint
CREATE INDEX "dataset_upload_intents_owner_idx" ON "dataset_upload_intents" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_version_unique" ON "dataset_versions" USING btree ("dataset_id","version");--> statement-breakpoint
CREATE INDEX "dataset_versions_dataset_active_idx" ON "dataset_versions" USING btree ("dataset_id","active");--> statement-breakpoint
CREATE INDEX "datasets_owner_status_idx" ON "datasets" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "datasets_deleted_at_idx" ON "datasets" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_owner_object_key_unique" ON "datasets" USING btree ("owner_id","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_owner_operation_key_unique" ON "idempotency_records" USING btree ("owner_id","operation","key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_at_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("published_at","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_id");