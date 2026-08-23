CREATE TABLE "memory_context_heads" (
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_context_heads_user_id_dataset_id_dataset_version_id_pk" PRIMARY KEY("user_id","dataset_id","dataset_version_id"),
	CONSTRAINT "memory_context_heads_revision_check" CHECK ("memory_context_heads"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "memory_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"source_clarification_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"confidence" varchar(16) NOT NULL,
	"definition_key" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"definition" jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"index_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"vector_point_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"embedding_model" varchar(200),
	"failure_code" varchar(80),
	"indexed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_records_kind_check" CHECK ("memory_records"."kind" = 'definition'),
	CONSTRAINT "memory_records_confidence_check" CHECK ("memory_records"."confidence" = 'confirmed'),
	CONSTRAINT "memory_records_definition_key_check" CHECK (char_length(btrim("memory_records"."definition_key")) between 1 and 120 and "memory_records"."definition_key" = lower(btrim("memory_records"."definition_key"))),
	CONSTRAINT "memory_records_content_check" CHECK (char_length(btrim("memory_records"."content")) between 1 and 4000),
	CONSTRAINT "memory_records_definition_check" CHECK (jsonb_typeof("memory_records"."definition") = 'object' and "memory_records"."definition"->>'version' = '1'),
	CONSTRAINT "memory_records_hash_check" CHECK ("memory_records"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "memory_records_schema_check" CHECK ("memory_records"."schema_version" = 1),
	CONSTRAINT "memory_records_status_check" CHECK ("memory_records"."index_status" in ('pending', 'indexing', 'indexed', 'failed', 'deleting'))
);
--> statement-breakpoint
CREATE TABLE "semantic_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"document_type" varchar(40) NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"index_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"vector_point_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"embedding_model" varchar(200),
	"failure_code" varchar(80),
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semantic_documents_type_check" CHECK ("semantic_documents"."document_type" in ('dataset_description', 'column_profile')),
	CONSTRAINT "semantic_documents_content_check" CHECK (char_length(btrim("semantic_documents"."content")) between 1 and 4000),
	CONSTRAINT "semantic_documents_hash_check" CHECK ("semantic_documents"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "semantic_documents_schema_check" CHECK ("semantic_documents"."schema_version" = 1),
	CONSTRAINT "semantic_documents_status_check" CHECK ("semantic_documents"."index_status" in ('pending', 'indexing', 'indexed', 'failed', 'deleting'))
);
--> statement-breakpoint
ALTER TABLE "memory_context_heads" ADD CONSTRAINT "memory_context_heads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_context_heads" ADD CONSTRAINT "memory_context_heads_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_conversation_message_fk" FOREIGN KEY ("user_id","conversation_id","source_message_id") REFERENCES "public"."messages"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_clarifications_user_conversation_id_unique" ON "agent_clarifications" USING btree ("user_id","conversation_id","id");--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_conversation_clarification_fk" FOREIGN KEY ("user_id","conversation_id","source_clarification_id") REFERENCES "public"."agent_clarifications"("user_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_documents" ADD CONSTRAINT "semantic_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_documents" ADD CONSTRAINT "semantic_documents_user_dataset_version_fk" FOREIGN KEY ("user_id","dataset_id","dataset_version_id") REFERENCES "public"."dataset_versions"("user_id","dataset_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_records_active_definition_unique" ON "memory_records" USING btree ("user_id","dataset_version_id","definition_key") WHERE "memory_records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_records_vector_point_unique" ON "memory_records" USING btree ("vector_point_id");--> statement-breakpoint
CREATE INDEX "memory_records_retrieval_idx" ON "memory_records" USING btree ("user_id","dataset_id","dataset_version_id","index_status");--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_documents_source_unique" ON "semantic_documents" USING btree ("user_id","dataset_version_id","document_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_documents_vector_point_unique" ON "semantic_documents" USING btree ("vector_point_id");--> statement-breakpoint
CREATE INDEX "semantic_documents_retrieval_idx" ON "semantic_documents" USING btree ("user_id","dataset_id","dataset_version_id","index_status");
--> statement-breakpoint
ALTER TABLE public.memory_context_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_context_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY "memory_context_heads_user_isolation" ON public.memory_context_heads
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.semantic_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY "semantic_documents_user_isolation" ON public.semantic_documents
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE public.memory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_records FORCE ROW LEVEL SECURITY;
CREATE POLICY "memory_records_user_isolation" ON public.memory_records
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON TABLE public.memory_context_heads FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.memory_context_heads TO agentic_csv_app;
GRANT UPDATE (revision, updated_at)
  ON TABLE public.memory_context_heads TO agentic_csv_app;

REVOKE ALL ON TABLE public.semantic_documents FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.semantic_documents TO agentic_csv_app;
GRANT UPDATE (index_status, embedding_model, failure_code, indexed_at, updated_at)
  ON TABLE public.semantic_documents TO agentic_csv_app;

REVOKE ALL ON TABLE public.memory_records FROM agentic_csv_app;
GRANT SELECT, INSERT ON TABLE public.memory_records TO agentic_csv_app;
GRANT UPDATE (
  conversation_id,
  source_message_id,
  source_clarification_id,
  content,
  definition,
  content_hash,
  index_status,
  embedding_model,
  failure_code,
  indexed_at,
  deleted_at,
  updated_at
) ON TABLE public.memory_records TO agentic_csv_app;
