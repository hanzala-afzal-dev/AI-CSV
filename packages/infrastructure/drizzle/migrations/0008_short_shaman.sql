CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'waiting_for_user', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conversation_message_role" AS ENUM('user', 'assistant', 'system_event', 'tool');--> statement-breakpoint
CREATE TYPE "public"."conversation_message_status" AS ENUM('streaming', 'final', 'failed');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"status" "agent_run_status" NOT NULL,
	"client_request_id" uuid NOT NULL,
	"selected_model" varchar(200),
	"selected_reasoning_effort" varchar(32),
	"step_count" integer DEFAULT 0 NOT NULL,
	"repair_count" integer DEFAULT 0 NOT NULL,
	"failure_code" varchar(80),
	"failure_message" varchar(500),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_count_check" CHECK ("agent_runs"."step_count" >= 0 and "agent_runs"."repair_count" >= 0),
	CONSTRAINT "agent_runs_terminal_timestamp_check" CHECK (("agent_runs"."status" = 'completed' and "agent_runs"."completed_at" is not null)
        or ("agent_runs"."status" = 'cancelled' and "agent_runs"."cancelled_at" is not null)
        or ("agent_runs"."status" in ('queued', 'running', 'waiting_for_user', 'failed')))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" "conversation_message_role" NOT NULL,
	"status" "conversation_message_status" NOT NULL,
	"content_parts" jsonb NOT NULL,
	"provider_response_reference" varchar(255),
	"usage_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "messages_sequence_check" CHECK ("messages"."sequence" > 0),
	CONSTRAINT "messages_content_parts_check" CHECK (jsonb_typeof("messages"."content_parts") = 'object'
        and "messages"."content_parts"->>'version' = '1'
        and jsonb_typeof("messages"."content_parts"->'parts') = 'array'
        and jsonb_array_length("messages"."content_parts"->'parts') between 1 and 16),
	CONSTRAINT "messages_finalized_at_check" CHECK (("messages"."status" = 'streaming' and "messages"."finalized_at" is null)
        or ("messages"."status" in ('final', 'failed') and "messages"."finalized_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_message_sequence" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_title_check" CHECK (char_length(btrim("conversations"."title")) between 1 and 120 and "conversations"."title" = btrim("conversations"."title")),
	CONSTRAINT "conversations_sequence_check" CHECK ("conversations"."last_message_sequence" >= 0),
	CONSTRAINT "conversations_version_check" CHECK ("conversations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_events_run_id_sequence_pk" PRIMARY KEY("run_id","sequence"),
	CONSTRAINT "run_events_sequence_check" CHECK ("run_events"."sequence" > 0),
	CONSTRAINT "run_events_type_check" CHECK ("run_events"."event_type" in ('run.queued', 'run.started', 'assistant.delta', 'run.completed', 'run.failed', 'run.cancelled')),
	CONSTRAINT "run_events_payload_check" CHECK (jsonb_typeof("run_events"."payload") = 'object' and "run_events"."payload"->>'version' = '1')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_id_id_unique" ON "conversations" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_user_conversation_id_unique" ON "messages" USING btree ("user_id","conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_user_conversation_id_unique" ON "agent_runs" USING btree ("user_id","conversation_id","id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_conversation_fk" FOREIGN KEY ("user_id","conversation_id") REFERENCES "public"."conversations"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_conversation_message_fk" FOREIGN KEY ("user_id","conversation_id","user_message_id") REFERENCES "public"."messages"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_conversation_fk" FOREIGN KEY ("user_id","conversation_id") REFERENCES "public"."conversations"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_user_conversation_run_fk" FOREIGN KEY ("user_id","conversation_id","run_id") REFERENCES "public"."agent_runs"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_user_client_request_unique" ON "agent_runs" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_one_active_per_conversation_unique" ON "agent_runs" USING btree ("conversation_id") WHERE "agent_runs"."status" in ('queued', 'running', 'waiting_for_user');--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_created_idx" ON "agent_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_unique" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_user_status_activity_idx" ON "conversations" USING btree ("user_id","status","last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_events_user_run_sequence_idx" ON "run_events" USING btree ("user_id","run_id","sequence");
--> statement-breakpoint
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversations_user_isolation" ON public.conversations
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
CREATE POLICY "messages_user_isolation" ON public.messages
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs_user_isolation" ON public.agent_runs
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "run_events_user_isolation" ON public.run_events
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON TABLE public.conversations FROM agentic_csv_app;
GRANT SELECT, INSERT, DELETE ON TABLE public.conversations TO agentic_csv_app;
GRANT UPDATE (title, status, last_message_sequence, last_activity_at, version, updated_at)
  ON TABLE public.conversations TO agentic_csv_app;

REVOKE ALL ON TABLE public.messages FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.messages TO agentic_csv_app;

REVOKE ALL ON TABLE public.agent_runs FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.agent_runs TO agentic_csv_app;
GRANT UPDATE (
  status, step_count, repair_count, failure_code, failure_message,
  started_at, completed_at, cancelled_at, updated_at
) ON TABLE public.agent_runs TO agentic_csv_app;

REVOKE ALL ON TABLE public.run_events FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.run_events TO agentic_csv_app;
