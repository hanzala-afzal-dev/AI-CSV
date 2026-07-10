CREATE TYPE "public"."dataset_version_status" AS ENUM('pending_upload', 'uploaded', 'queued', 'validating', 'profiling', 'indexing', 'ready', 'failed', 'deleting', 'deleted');--> statement-breakpoint
ALTER TABLE "dataset_versions" RENAME COLUMN "version" TO "version_number";--> statement-breakpoint
DROP INDEX "dataset_versions_dataset_version_unique";--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "schema_profile" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "statistical_profile" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ADD COLUMN "dataset_version_id" uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "original_filename" varchar(255);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "mime_type" varchar(120);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "encoding" varchar(40);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "delimiter" varchar(8);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "object_key" text;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "normalized_object_key" text;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "normalized_checksum" varchar(128);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "status" "dataset_version_status" DEFAULT 'pending_upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "failure_code" varchar(80);--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "row_count" integer;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "column_count" integer;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "profile_version" integer;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "dataset_versions" AS version
SET "user_id" = dataset."user_id",
    "original_filename" = dataset."original_filename",
    "mime_type" = 'text/csv',
    "object_key" = COALESCE(dataset."object_key", 'legacy/datasets/' || dataset."id"::text || '/original.csv'),
    "size_bytes" = 0,
    "status" = CASE dataset."status"::text
      WHEN 'uploaded' THEN 'uploaded'::dataset_version_status
      WHEN 'profiling' THEN 'profiling'::dataset_version_status
      WHEN 'ready' THEN 'ready'::dataset_version_status
      WHEN 'failed' THEN 'failed'::dataset_version_status
      ELSE 'pending_upload'::dataset_version_status
    END
FROM "datasets" AS dataset
WHERE dataset."id" = version."dataset_id";--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "dataset_versions" ALTER COLUMN "original_filename" SET NOT NULL;
ALTER TABLE "dataset_versions" ALTER COLUMN "mime_type" SET NOT NULL;
ALTER TABLE "dataset_versions" ALTER COLUMN "object_key" SET NOT NULL;
ALTER TABLE "dataset_versions" ALTER COLUMN "size_bytes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_user_id_id_unique" ON "datasets" USING btree ("user_id", "id");
CREATE UNIQUE INDEX "dataset_versions_user_id_id_unique" ON "dataset_versions" USING btree ("user_id", "id");--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_user_dataset_fk"
  FOREIGN KEY ("user_id", "dataset_id") REFERENCES "datasets"("user_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dataset_upload_intents" ADD CONSTRAINT "dataset_upload_intents_user_dataset_fk"
  FOREIGN KEY ("user_id", "dataset_id") REFERENCES "datasets"("user_id", "id") ON DELETE cascade;
ALTER TABLE "dataset_upload_intents" ADD CONSTRAINT "dataset_upload_intents_user_version_fk"
  FOREIGN KEY ("user_id", "dataset_version_id") REFERENCES "dataset_versions"("user_id", "id") ON DELETE cascade;--> statement-breakpoint
DROP POLICY "dataset_versions_user_isolation" ON "dataset_versions";
CREATE POLICY "dataset_versions_user_isolation" ON "dataset_versions"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE INDEX "dataset_versions_user_status_idx" ON "dataset_versions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_version_unique" ON "dataset_versions" USING btree ("dataset_id","version_number");
