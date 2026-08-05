CREATE TABLE "analysis_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"plan" jsonb NOT NULL,
	"plan_hash" varchar(64) NOT NULL,
	"validation_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_plans_plan_check" CHECK (jsonb_typeof("analysis_plans"."plan") = 'object' and "analysis_plans"."plan"->>'version' = '1'
        and pg_column_size("analysis_plans"."plan") <= 32768),
	CONSTRAINT "analysis_plans_hash_check" CHECK ("analysis_plans"."plan_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "analysis_plans_validation_status_check" CHECK ("analysis_plans"."validation_status" = 'validated')
);
--> statement-breakpoint
CREATE TABLE "analysis_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_hash" varchar(64) NOT NULL,
	"result_schema" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"truncated" boolean NOT NULL,
	"execution_ms" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_results_schema_check" CHECK (jsonb_typeof("analysis_results"."result_schema") = 'array'
        and jsonb_array_length("analysis_results"."result_schema") between 1 and 20
        and pg_column_size("analysis_results"."result_schema") <= 32768),
	CONSTRAINT "analysis_results_rows_check" CHECK (jsonb_typeof("analysis_results"."rows") = 'array'
        and jsonb_array_length("analysis_results"."rows") <= 500
        and pg_column_size("analysis_results"."rows") <= 2097152),
	CONSTRAINT "analysis_results_counts_check" CHECK ("analysis_results"."row_count" >= 0 and "analysis_results"."execution_ms" >= 0),
	CONSTRAINT "analysis_results_checksum_check" CHECK ("analysis_results"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "analysis_results_plan_hash_check" CHECK ("analysis_results"."plan_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "analysis_results_provenance_check" CHECK (jsonb_typeof("analysis_results"."provenance") = 'object'
        and "analysis_results"."provenance"->>'version' = '1'
        and pg_column_size("analysis_results"."provenance") <= 65536)
);
--> statement-breakpoint
CREATE TABLE "chart_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"result_artifact_id" uuid NOT NULL,
	"chart_spec" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_artifacts_schema_version_check" CHECK ("chart_artifacts"."schema_version" = 1),
	CONSTRAINT "chart_artifacts_spec_check" CHECK (jsonb_typeof("chart_artifacts"."chart_spec") = 'object'
        and "chart_artifacts"."chart_spec"->>'version' = '1'
        and pg_column_size("chart_artifacts"."chart_spec") <= 65536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_plans_user_run_id_unique" ON "analysis_plans" USING btree ("user_id","run_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_results_user_id_unique" ON "analysis_results" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "analysis_plans" ADD CONSTRAINT "analysis_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_plans" ADD CONSTRAINT "analysis_plans_user_conversation_run_fk" FOREIGN KEY ("user_id","conversation_id","run_id") REFERENCES "public"."agent_runs"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_plans" ADD CONSTRAINT "analysis_plans_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_user_run_plan_fk" FOREIGN KEY ("user_id","run_id","plan_id") REFERENCES "public"."analysis_plans"("user_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_artifacts" ADD CONSTRAINT "chart_artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_artifacts" ADD CONSTRAINT "chart_artifacts_user_conversation_run_fk" FOREIGN KEY ("user_id","conversation_id","run_id") REFERENCES "public"."agent_runs"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_artifacts" ADD CONSTRAINT "chart_artifacts_user_conversation_message_fk" FOREIGN KEY ("user_id","conversation_id","message_id") REFERENCES "public"."messages"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_artifacts" ADD CONSTRAINT "chart_artifacts_user_result_fk" FOREIGN KEY ("user_id","result_artifact_id") REFERENCES "public"."analysis_results"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_plans_user_run_unique" ON "analysis_plans" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE INDEX "analysis_plans_user_dataset_version_idx" ON "analysis_plans" USING btree ("user_id","dataset_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_results_user_run_unique" ON "analysis_results" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE INDEX "analysis_results_user_conversation_created_idx" ON "analysis_results" USING btree ("user_id","conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_artifacts_user_result_unique" ON "chart_artifacts" USING btree ("user_id","result_artifact_id");--> statement-breakpoint
CREATE INDEX "chart_artifacts_user_message_idx" ON "chart_artifacts" USING btree ("user_id","message_id");--> statement-breakpoint

ALTER TABLE public.analysis_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY "analysis_plans_user_isolation" ON public.analysis_plans
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results FORCE ROW LEVEL SECURITY;
CREATE POLICY "analysis_results_user_isolation" ON public.analysis_results
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.chart_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY "chart_artifacts_user_isolation" ON public.chart_artifacts
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint

REVOKE ALL ON TABLE public.analysis_plans FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.analysis_plans TO agentic_csv_app;

REVOKE ALL ON TABLE public.analysis_results FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.analysis_results TO agentic_csv_app;

REVOKE ALL ON TABLE public.chart_artifacts FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.chart_artifacts TO agentic_csv_app;
