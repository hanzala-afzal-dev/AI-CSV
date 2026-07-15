ALTER TYPE "public"."dataset_status" ADD VALUE 'deleting';--> statement-breakpoint
CREATE TABLE "dataset_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"canonical_name" varchar(160) NOT NULL,
	"inferred_type" varchar(32) NOT NULL,
	"semantic_type" varchar(32) NOT NULL,
	"nullable" boolean NOT NULL,
	"statistics" jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_columns_ordinal_check" CHECK ("dataset_columns"."ordinal" >= 0),
	CONSTRAINT "dataset_columns_inferred_type_check" CHECK ("dataset_columns"."inferred_type" in ('integer', 'decimal', 'boolean', 'date', 'timestamp', 'text')),
	CONSTRAINT "dataset_columns_semantic_type_check" CHECK ("dataset_columns"."semantic_type" in ('identifier', 'numeric', 'date', 'categorical', 'free_text')),
	CONSTRAINT "dataset_columns_statistics_check" CHECK (jsonb_typeof("dataset_columns"."statistics") = 'object' and "dataset_columns"."statistics"->>'version' = '1')
);
--> statement-breakpoint
CREATE TABLE "dataset_profiles" (
	"dataset_version_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"profile" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"suggested_prompts" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dataset_profiles_profile_check" CHECK (jsonb_typeof("dataset_profiles"."profile") = 'object' and "dataset_profiles"."profile"->>'version' = '1'),
	CONSTRAINT "dataset_profiles_warnings_check" CHECK (jsonb_typeof("dataset_profiles"."warnings") = 'array'),
	CONSTRAINT "dataset_profiles_suggestions_check" CHECK (jsonb_typeof("dataset_profiles"."suggested_prompts") = 'array'
        and jsonb_array_length("dataset_profiles"."suggested_prompts") between 3 and 6)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_dataset_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_dataset_version_id" uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "ingestion_claim_id" varchar(128);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "ingestion_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "ingestion_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN "active_version_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_user_dataset_id_unique" ON "dataset_versions" USING btree ("user_id","dataset_id","id");--> statement-breakpoint
ALTER TABLE "dataset_columns" ADD CONSTRAINT "dataset_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_columns" ADD CONSTRAINT "dataset_columns_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_profiles" ADD CONSTRAINT "dataset_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_profiles" ADD CONSTRAINT "dataset_profiles_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_columns_version_ordinal_unique" ON "dataset_columns" USING btree ("dataset_version_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_columns_version_canonical_unique" ON "dataset_columns" USING btree ("dataset_version_id","canonical_name");--> statement-breakpoint
CREATE INDEX "dataset_columns_user_version_idx" ON "dataset_columns" USING btree ("user_id","dataset_version_id");--> statement-breakpoint
CREATE INDEX "dataset_profiles_user_dataset_idx" ON "dataset_profiles" USING btree ("user_id","dataset_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_dataset_fk" FOREIGN KEY ("user_id","active_dataset_id") REFERENCES "public"."datasets"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_dataset_version_fk" FOREIGN KEY ("user_id","active_dataset_id","active_dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_active_version_fk" FOREIGN KEY ("user_id","id","active_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_dataset_check" CHECK (("conversations"."active_dataset_id" is null and "conversations"."active_dataset_version_id" is null)
        or ("conversations"."active_dataset_id" is not null and "conversations"."active_dataset_version_id" is not null));--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_counts_check" CHECK (("dataset_versions"."row_count" is null or "dataset_versions"."row_count" >= 0)
        and ("dataset_versions"."column_count" is null or "dataset_versions"."column_count" > 0)
        and ("dataset_versions"."profile_version" is null or "dataset_versions"."profile_version" > 0)
        and "dataset_versions"."ingestion_attempt" >= 0);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_claim_check" CHECK (("dataset_versions"."ingestion_claim_id" is null and "dataset_versions"."ingestion_claimed_at" is null)
        or ("dataset_versions"."ingestion_claim_id" is not null and "dataset_versions"."ingestion_claimed_at" is not null));--> statement-breakpoint

ALTER TABLE public.dataset_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_columns FORCE ROW LEVEL SECURITY;
CREATE POLICY "dataset_columns_user_isolation" ON public.dataset_columns
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.dataset_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY "dataset_profiles_user_isolation" ON public.dataset_profiles
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint

REVOKE ALL ON TABLE public.datasets FROM agentic_csv_app;
GRANT SELECT, DELETE ON TABLE public.datasets TO agentic_csv_app;
GRANT INSERT (
  id, user_id, name, original_filename, object_key, status, row_count, column_count,
  failure_reason, active_version_id, created_at, updated_at, deleted_at
) ON TABLE public.datasets TO agentic_csv_app;
GRANT UPDATE (
  name, original_filename, object_key, status, row_count, column_count,
  failure_reason, active_version_id, updated_at, deleted_at
) ON TABLE public.datasets TO agentic_csv_app;

REVOKE ALL ON TABLE public.dataset_versions FROM agentic_csv_app;
GRANT SELECT, DELETE ON TABLE public.dataset_versions TO agentic_csv_app;
GRANT INSERT (
  id, user_id, dataset_id, version_number, original_filename, mime_type, encoding,
  delimiter, object_key, normalized_object_key, size_bytes, checksum,
  normalized_checksum, status, failure_code, row_count, column_count,
  profile_version, schema_profile, statistical_profile, active,
  ingestion_claim_id, ingestion_claimed_at, ingestion_attempt,
  created_at, updated_at, deleted_at
) ON TABLE public.dataset_versions TO agentic_csv_app;
GRANT UPDATE (
  encoding, delimiter, normalized_object_key, normalized_checksum, status, failure_code,
  row_count, column_count, profile_version, schema_profile, statistical_profile,
  active, ingestion_claim_id, ingestion_claimed_at, ingestion_attempt, updated_at,
  deleted_at
) ON TABLE public.dataset_versions TO agentic_csv_app;

REVOKE ALL ON TABLE public.dataset_upload_intents FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.dataset_upload_intents TO agentic_csv_app;
GRANT UPDATE (completed_at) ON TABLE public.dataset_upload_intents TO agentic_csv_app;

REVOKE ALL ON TABLE public.dataset_columns FROM agentic_csv_app;
GRANT SELECT, INSERT, DELETE ON TABLE public.dataset_columns TO agentic_csv_app;

REVOKE ALL ON TABLE public.dataset_profiles FROM agentic_csv_app;
GRANT SELECT, INSERT, DELETE ON TABLE public.dataset_profiles TO agentic_csv_app;

GRANT UPDATE (active_dataset_id, active_dataset_version_id, version, updated_at)
  ON TABLE public.conversations TO agentic_csv_app;
