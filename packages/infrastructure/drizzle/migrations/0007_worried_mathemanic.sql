CREATE TYPE "public"."provider_credential_status" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" varchar(24) NOT NULL,
	"auth_tag" varchar(24) NOT NULL,
	"encrypted_data_key" text,
	"algorithm" varchar(32) NOT NULL,
	"key_version" varchar(64) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"status" "provider_credential_status" NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_provider_check" CHECK ("provider_credentials"."provider" = 'openai'),
	CONSTRAINT "provider_credentials_algorithm_check" CHECK ("provider_credentials"."algorithm" = 'AES-256-GCM'),
	CONSTRAINT "provider_credentials_last4_check" CHECK (char_length("provider_credentials"."last4") = 4),
	CONSTRAINT "provider_credentials_nonce_check" CHECK (char_length("provider_credentials"."nonce") = 16 and "provider_credentials"."nonce" ~ '^[A-Za-z0-9+/]{16}$'),
	CONSTRAINT "provider_credentials_auth_tag_check" CHECK (char_length("provider_credentials"."auth_tag") = 24 and "provider_credentials"."auth_tag" ~ '^[A-Za-z0-9+/]{22}==$'),
	CONSTRAINT "provider_credentials_fingerprint_check" CHECK ("provider_credentials"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_credentials_key_version_check" CHECK ("provider_credentials"."key_version" ~ '^[A-Za-z0-9._-]{1,64}$')
);
--> statement-breakpoint
CREATE TABLE "provider_preferences" (
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model_id" varchar(200) NOT NULL,
	"reasoning_effort" varchar(32) NOT NULL,
	"reasoning_mode" varchar(64),
	"model_validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_preferences_user_id_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "provider_preferences_provider_check" CHECK ("provider_preferences"."provider" = 'openai'),
	CONSTRAINT "provider_preferences_model_id_check" CHECK ("provider_preferences"."model_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
	CONSTRAINT "provider_preferences_reasoning_effort_check" CHECK ("provider_preferences"."reasoning_effort" in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))
);
--> statement-breakpoint
CREATE TABLE "security_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"subject_type" varchar(80) NOT NULL,
	"subject_id" uuid,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "security_audit_events_outcome_check" CHECK ("security_audit_events"."outcome" in ('success', 'failure')),
	CONSTRAINT "security_audit_events_event_type_check" CHECK ("security_audit_events"."event_type" in ('provider.credential.added', 'provider.credential.replaced', 'provider.credential.validation_succeeded', 'provider.credential.validation_failed', 'provider.credential.deleted', 'provider.preferences.fallback_applied', 'provider.preferences.updated')),
	CONSTRAINT "security_audit_events_subject_type_check" CHECK ("security_audit_events"."subject_type" = 'provider_credential'),
	CONSTRAINT "security_audit_events_metadata_keys_check" CHECK (jsonb_typeof("security_audit_events"."metadata") = 'object' and ("security_audit_events"."metadata" - array['provider','operation','code','fallbackApplied','modelId','reasoningEffort']::text[]) = '{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_preferences" ADD CONSTRAINT "provider_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_user_provider_unique" ON "provider_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "provider_credentials_user_status_idx" ON "provider_credentials" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "security_audit_events_user_occurred_idx" ON "security_audit_events" USING btree ("user_id","occurred_at");
--> statement-breakpoint
ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_credentials_user_isolation" ON public.provider_credentials
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
ALTER TABLE public.provider_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_preferences_user_isolation" ON public.provider_preferences
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_audit_events_user_isolation" ON public.security_audit_events
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON TABLE public.provider_credentials FROM agentic_csv_app;
GRANT SELECT (id, user_id, provider, last4, status, validated_at, created_at, updated_at)
  ON TABLE public.provider_credentials TO agentic_csv_app;
GRANT INSERT (
  id, user_id, provider, ciphertext, nonce, auth_tag, encrypted_data_key, algorithm,
  key_version, last4, fingerprint, status, validated_at, created_at, updated_at
) ON TABLE public.provider_credentials TO agentic_csv_app;
GRANT UPDATE (status, validated_at, updated_at)
  ON TABLE public.provider_credentials TO agentic_csv_app;
GRANT DELETE ON TABLE public.provider_credentials TO agentic_csv_app;
--> statement-breakpoint
REVOKE ALL ON TABLE public.provider_preferences FROM agentic_csv_app;
GRANT SELECT, DELETE ON TABLE public.provider_preferences TO agentic_csv_app;
GRANT INSERT (
  user_id, provider, model_id, reasoning_effort, reasoning_mode,
  model_validated_at, created_at, updated_at
) ON TABLE public.provider_preferences TO agentic_csv_app;
GRANT UPDATE (model_id, reasoning_effort, reasoning_mode, model_validated_at, updated_at)
  ON TABLE public.provider_preferences TO agentic_csv_app;
--> statement-breakpoint
REVOKE ALL ON TABLE public.security_audit_events FROM agentic_csv_app;
GRANT SELECT (
  id, user_id, event_type, outcome, subject_type, subject_id, correlation_id,
  metadata, occurred_at
) ON TABLE public.security_audit_events TO agentic_csv_app;
GRANT INSERT (
  user_id, event_type, outcome, subject_type, subject_id, correlation_id,
  metadata, occurred_at
) ON TABLE public.security_audit_events TO agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.provider_get_credential_secret(p_provider text)
RETURNS TABLE(
  id uuid,
  provider text,
  ciphertext text,
  nonce text,
  auth_tag text,
  algorithm text,
  key_version text,
  fingerprint text,
  last4 text,
  status public.provider_credential_status,
  validated_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    credential.id,
    credential.provider::text,
    credential.ciphertext,
    credential.nonce::text,
    credential.auth_tag::text,
    credential.algorithm::text,
    credential.key_version::text,
    credential.fingerprint::text,
    credential.last4::text,
    credential.status,
    credential.validated_at,
    credential.updated_at
  FROM public.provider_credentials credential
  WHERE credential.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    AND credential.provider = p_provider
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.provider_get_credential_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_get_credential_secret(text) TO agentic_csv_app;
