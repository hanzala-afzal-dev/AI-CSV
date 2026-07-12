ALTER TABLE "owners" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "analysis_threads" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "datasets" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "idempotency_records" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "outbox_events" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "analysis_threads" DROP CONSTRAINT "analysis_threads_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" DROP CONSTRAINT "dataset_upload_intents_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "datasets" DROP CONSTRAINT "datasets_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "idempotency_records" DROP CONSTRAINT "idempotency_records_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_owner_id_owners_id_fk";
--> statement-breakpoint
DROP INDEX "analysis_threads_owner_dataset_idx";--> statement-breakpoint
DROP INDEX "api_keys_owner_active_idx";--> statement-breakpoint
DROP INDEX "dataset_upload_intents_owner_idx";--> statement-breakpoint
DROP INDEX "datasets_owner_status_idx";--> statement-breakpoint
DROP INDEX "datasets_owner_object_key_unique";--> statement-breakpoint
DROP INDEX "idempotency_owner_operation_key_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" varchar(32) DEFAULT 'api_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_threads" ADD CONSTRAINT "analysis_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ADD CONSTRAINT "dataset_upload_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_threads_user_dataset_idx" ON "analysis_threads" USING btree ("user_id","dataset_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_active_idx" ON "api_keys" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "dataset_upload_intents_user_idx" ON "dataset_upload_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "datasets_user_status_idx" ON "datasets" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_user_object_key_unique" ON "datasets" USING btree ("user_id","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_user_operation_key_unique" ON "idempotency_records" USING btree ("user_id","operation","key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
--> statement-breakpoint
ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "datasets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "datasets_user_isolation" ON "datasets"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dataset_upload_intents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dataset_upload_intents_user_isolation" ON "dataset_upload_intents"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "dataset_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dataset_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dataset_versions_user_isolation" ON "dataset_versions"
  USING (EXISTS (
    SELECT 1 FROM "datasets" dataset
    WHERE dataset."id" = "dataset_versions"."dataset_id"
      AND dataset."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "datasets" dataset
    WHERE dataset."id" = "dataset_versions"."dataset_id"
      AND dataset."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
  ));
--> statement-breakpoint
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "idempotency_records_user_isolation" ON "idempotency_records"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "analysis_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "analysis_threads_user_isolation" ON "analysis_threads"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "analysis_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "analysis_messages_user_isolation" ON "analysis_messages"
  USING (EXISTS (
    SELECT 1 FROM "analysis_threads" thread
    WHERE thread."id" = "analysis_messages"."thread_id"
      AND thread."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "analysis_threads" thread
    WHERE thread."id" = "analysis_messages"."thread_id"
      AND thread."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
  ));
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO agentic_csv_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agentic_csv_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agentic_csv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agentic_csv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agentic_csv_app;
