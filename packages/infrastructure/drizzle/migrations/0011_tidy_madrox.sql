CREATE TABLE "agent_checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_checkpoints_revision_check" CHECK ("agent_checkpoints"."revision" > 0),
	CONSTRAINT "agent_checkpoints_state_check" CHECK (jsonb_typeof("agent_checkpoints"."state") = 'object'
        and "agent_checkpoints"."state"->>'version' = '1'
        and "agent_checkpoints"."state"->>'userId' = "agent_checkpoints"."user_id"::text
        and "agent_checkpoints"."state"->>'conversationId' = "agent_checkpoints"."conversation_id"::text
        and "agent_checkpoints"."state"->>'runId' = "agent_checkpoints"."run_id"::text
        and pg_column_size("agent_checkpoints"."state") <= 524288)
);
--> statement-breakpoint
CREATE TABLE "agent_clarifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"question" varchar(500) NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"answer" varchar(2000),
	"answer_message_id" uuid,
	"asked_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "agent_clarifications_status_check" CHECK ("agent_clarifications"."status" in ('pending', 'answered')),
	CONSTRAINT "agent_clarifications_options_check" CHECK (jsonb_typeof("agent_clarifications"."options") = 'array'
        and jsonb_array_length("agent_clarifications"."options") <= 8
        and pg_column_size("agent_clarifications"."options") <= 16384),
	CONSTRAINT "agent_clarifications_answer_check" CHECK (("agent_clarifications"."status" = 'pending' and "agent_clarifications"."answer" is null and "agent_clarifications"."answer_message_id" is null and "agent_clarifications"."answered_at" is null)
        or ("agent_clarifications"."status" = 'answered' and char_length(btrim("agent_clarifications"."answer")) between 1 and 2000
          and "agent_clarifications"."answer_message_id" is not null and "agent_clarifications"."answered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_count_check";--> statement-breakpoint
ALTER TABLE "run_events" DROP CONSTRAINT "run_events_type_check";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "tool_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "progress_stage" varchar(32);--> statement-breakpoint
ALTER TABLE "agent_checkpoints" ADD CONSTRAINT "agent_checkpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_checkpoints" ADD CONSTRAINT "agent_checkpoints_user_conversation_run_fk" FOREIGN KEY ("user_id","conversation_id","run_id") REFERENCES "public"."agent_runs"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_clarifications" ADD CONSTRAINT "agent_clarifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_clarifications" ADD CONSTRAINT "agent_clarifications_user_conversation_run_fk" FOREIGN KEY ("user_id","conversation_id","run_id") REFERENCES "public"."agent_runs"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_clarifications" ADD CONSTRAINT "agent_clarifications_user_conversation_message_fk" FOREIGN KEY ("user_id","conversation_id","answer_message_id") REFERENCES "public"."messages"("user_id","conversation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_checkpoints_user_run_unique" ON "agent_checkpoints" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE INDEX "agent_checkpoints_user_conversation_idx" ON "agent_checkpoints" USING btree ("user_id","conversation_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_clarifications_user_run_unique" ON "agent_clarifications" USING btree ("user_id","run_id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_progress_stage_check" CHECK ("agent_runs"."progress_stage" is null or "agent_runs"."progress_stage" in ('authorizing', 'planning', 'validating', 'analyzing', 'verifying', 'explaining'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_count_check" CHECK ("agent_runs"."step_count" >= 0 and "agent_runs"."repair_count" >= 0 and "agent_runs"."tool_call_count" >= 0);--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_type_check" CHECK ("run_events"."event_type" in ('run.queued', 'run.started', 'run.progress', 'run.clarification', 'run.resumed', 'assistant.delta', 'run.completed', 'run.failed', 'run.cancelled'));
--> statement-breakpoint
ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY "agent_checkpoints_user_isolation" ON public.agent_checkpoints
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.agent_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_clarifications FORCE ROW LEVEL SECURITY;
CREATE POLICY "agent_clarifications_user_isolation" ON public.agent_clarifications
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON TABLE public.agent_checkpoints FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.agent_checkpoints TO agentic_csv_app;
GRANT UPDATE (state, revision, updated_at)
  ON TABLE public.agent_checkpoints TO agentic_csv_app;

REVOKE ALL ON TABLE public.agent_clarifications FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.agent_clarifications TO agentic_csv_app;
GRANT UPDATE (status, answer, answer_message_id, answered_at)
  ON TABLE public.agent_clarifications TO agentic_csv_app;

GRANT UPDATE (tool_call_count, progress_stage)
  ON TABLE public.agent_runs TO agentic_csv_app;
