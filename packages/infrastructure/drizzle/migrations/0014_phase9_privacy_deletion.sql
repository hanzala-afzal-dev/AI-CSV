ALTER TYPE "public"."dataset_status" ADD VALUE 'deleted';--> statement-breakpoint
CREATE TABLE "privacy_deletion_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"resource_hash" varchar(64),
	"scope" varchar(16) NOT NULL,
	"object_count" integer NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_deletion_audits_hash_check" CHECK ("privacy_deletion_audits"."subject_hash" ~ '^[0-9a-f]{64}$'
        and ("privacy_deletion_audits"."resource_hash" is null or "privacy_deletion_audits"."resource_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "privacy_deletion_audits_scope_check" CHECK ("privacy_deletion_audits"."scope" in ('dataset', 'account')),
	CONSTRAINT "privacy_deletion_audits_object_count_check" CHECK ("privacy_deletion_audits"."object_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "privacy_deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" varchar(16) NOT NULL,
	"dataset_id" uuid,
	"client_request_id" uuid NOT NULL,
	"correlation_id" varchar(160) NOT NULL,
	"object_keys" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failure_code" varchar(80),
	"requested_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "privacy_deletion_requests_scope_check" CHECK (("privacy_deletion_requests"."scope" = 'dataset' and "privacy_deletion_requests"."dataset_id" is not null)
        or ("privacy_deletion_requests"."scope" = 'account' and "privacy_deletion_requests"."dataset_id" is null)),
	CONSTRAINT "privacy_deletion_requests_status_check" CHECK ("privacy_deletion_requests"."status" in ('scheduled', 'processing', 'failed', 'completed')),
	CONSTRAINT "privacy_deletion_requests_objects_check" CHECK (jsonb_typeof("privacy_deletion_requests"."object_keys") = 'array'
        and jsonb_array_length("privacy_deletion_requests"."object_keys") <= 1000),
	CONSTRAINT "privacy_deletion_requests_attempts_check" CHECK ("privacy_deletion_requests"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "privacy_deletion_requests" ADD CONSTRAINT "privacy_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_deletion_requests" ADD CONSTRAINT "privacy_deletion_requests_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_deletion_audits_completed_idx" ON "privacy_deletion_audits" USING btree ("completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_deletion_requests_user_client_unique" ON "privacy_deletion_requests" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_deletion_requests_active_dataset_unique" ON "privacy_deletion_requests" USING btree ("user_id","dataset_id") WHERE "privacy_deletion_requests"."scope" = 'dataset' and "privacy_deletion_requests"."status" in ('scheduled', 'processing', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_deletion_requests_active_account_unique" ON "privacy_deletion_requests" USING btree ("user_id") WHERE "privacy_deletion_requests"."scope" = 'account' and "privacy_deletion_requests"."status" in ('scheduled', 'processing', 'failed');--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE public.privacy_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_deletion_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY "privacy_deletion_requests_user_isolation"
  ON public.privacy_deletion_requests
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

REVOKE ALL ON TABLE public.privacy_deletion_requests FROM agentic_csv_app;
GRANT SELECT ON TABLE public.privacy_deletion_requests TO agentic_csv_app;
REVOKE ALL ON TABLE public.privacy_deletion_audits FROM agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.privacy_schedule_dataset(
  p_deletion_id uuid,
  p_user_id uuid,
  p_dataset_id uuid,
  p_client_request_id uuid,
  p_correlation_id text,
  p_requested_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_object_keys jsonb;
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'privacy actor mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.users
    WHERE id = p_user_id AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_id
    FROM public.privacy_deletion_requests
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
  IF FOUND THEN RETURN v_id; END IF;

  PERFORM 1 FROM public.datasets
    WHERE id = p_dataset_id
      AND user_id = p_user_id
      AND deleted_at IS NULL
      AND status <> 'deleted'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_id
    FROM public.privacy_deletion_requests
    WHERE user_id = p_user_id
      AND dataset_id = p_dataset_id
      AND scope = 'dataset'
      AND status IN ('scheduled', 'processing', 'failed')
    LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;

  SELECT coalesce(jsonb_agg(object_key ORDER BY object_key), '[]'::jsonb)
    INTO v_object_keys
    FROM (
      SELECT object_key
        FROM public.dataset_versions
        WHERE user_id = p_user_id AND dataset_id = p_dataset_id
      UNION
      SELECT normalized_object_key
        FROM public.dataset_versions
        WHERE user_id = p_user_id
          AND dataset_id = p_dataset_id
          AND normalized_object_key IS NOT NULL
      UNION
      SELECT object_key
        FROM public.dataset_upload_intents
        WHERE user_id = p_user_id AND dataset_id = p_dataset_id
    ) owned_objects;

  UPDATE public.agent_runs
    SET status = 'cancelled',
        cancelled_at = p_requested_at,
        updated_at = p_requested_at
    WHERE user_id = p_user_id
      AND status IN ('queued', 'running', 'waiting_for_user')
      AND conversation_id IN (
        SELECT id FROM public.conversations
          WHERE user_id = p_user_id AND active_dataset_id = p_dataset_id
      );

  UPDATE public.conversations
    SET active_dataset_id = NULL,
        active_dataset_version_id = NULL,
        version = version + 1,
        updated_at = p_requested_at
    WHERE user_id = p_user_id AND active_dataset_id = p_dataset_id;

  UPDATE public.dataset_versions
    SET status = 'deleting',
        active = false,
        updated_at = p_requested_at
    WHERE user_id = p_user_id AND dataset_id = p_dataset_id;

  UPDATE public.datasets
    SET status = 'deleting',
        active_version_id = NULL,
        updated_at = p_requested_at
    WHERE user_id = p_user_id AND id = p_dataset_id;

  INSERT INTO public.privacy_deletion_requests (
    id, user_id, scope, dataset_id, client_request_id, correlation_id,
    object_keys, status, requested_at
  ) VALUES (
    p_deletion_id, p_user_id, 'dataset', p_dataset_id, p_client_request_id,
    left(p_correlation_id, 160), v_object_keys, 'scheduled', p_requested_at
  );

  INSERT INTO public.outbox_events (
    event_id, user_id, aggregate_id, event_name, payload, occurred_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_deletion_id, 'queue.privacy.delete.v1',
    jsonb_build_object(
      'version', 1,
      'jobName', 'privacy.delete.v1',
      'correlationId', left(p_correlation_id, 160),
      'userId', p_user_id,
      'deletionId', p_deletion_id,
      'idempotencyKey', 'privacy:' || p_deletion_id::text
    ),
    p_requested_at
  );
  RETURN p_deletion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_schedule_dataset(uuid, uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_schedule_dataset(uuid, uuid, uuid, uuid, text, timestamptz) TO agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.privacy_schedule_account(
  p_deletion_id uuid,
  p_user_id uuid,
  p_client_request_id uuid,
  p_correlation_id text,
  p_requested_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_object_keys jsonb;
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'privacy actor mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN p_deletion_id; END IF;

  SELECT id INTO v_id
    FROM public.privacy_deletion_requests
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
  IF FOUND THEN RETURN v_id; END IF;

  SELECT id INTO v_id
    FROM public.privacy_deletion_requests
    WHERE user_id = p_user_id
      AND scope = 'account'
      AND status IN ('scheduled', 'processing', 'failed')
    LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;

  SELECT coalesce(jsonb_agg(object_key ORDER BY object_key), '[]'::jsonb)
    INTO v_object_keys
    FROM (
      SELECT object_key FROM public.dataset_versions WHERE user_id = p_user_id
      UNION
      SELECT normalized_object_key
        FROM public.dataset_versions
        WHERE user_id = p_user_id AND normalized_object_key IS NOT NULL
      UNION
      SELECT object_key FROM public.dataset_upload_intents WHERE user_id = p_user_id
    ) owned_objects;

  INSERT INTO public.privacy_deletion_requests (
    id, user_id, scope, dataset_id, client_request_id, correlation_id,
    object_keys, status, requested_at
  ) VALUES (
    p_deletion_id, p_user_id, 'account', NULL, p_client_request_id,
    left(p_correlation_id, 160), v_object_keys, 'scheduled', p_requested_at
  );

  UPDATE public.sessions SET revoked_at = p_requested_at
    WHERE user_id = p_user_id AND revoked_at IS NULL;
  UPDATE public.agent_runs
    SET status = 'cancelled',
        cancelled_at = p_requested_at,
        updated_at = p_requested_at
    WHERE user_id = p_user_id
      AND status IN ('queued', 'running', 'waiting_for_user');
  UPDATE public.dataset_versions
    SET status = 'deleting', active = false, updated_at = p_requested_at
    WHERE user_id = p_user_id AND status <> 'deleted';
  UPDATE public.datasets
    SET status = 'deleting', active_version_id = NULL, updated_at = p_requested_at
    WHERE user_id = p_user_id AND status <> 'deleted';
  UPDATE public.users
    SET status = 'deleting', updated_at = p_requested_at
    WHERE id = p_user_id;

  INSERT INTO public.outbox_events (
    event_id, user_id, aggregate_id, event_name, payload, occurred_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_deletion_id, 'queue.privacy.delete.v1',
    jsonb_build_object(
      'version', 1,
      'jobName', 'privacy.delete.v1',
      'correlationId', left(p_correlation_id, 160),
      'userId', p_user_id,
      'deletionId', p_deletion_id,
      'idempotencyKey', 'privacy:' || p_deletion_id::text
    ),
    p_requested_at
  );
  RETURN p_deletion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_schedule_account(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_schedule_account(uuid, uuid, uuid, text, timestamptz) TO agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.privacy_claim(
  p_deletion_id uuid,
  p_user_id uuid,
  p_claimed_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'privacy actor mismatch' USING ERRCODE = '42501';
  END IF;
  UPDATE public.privacy_deletion_requests
    SET status = 'processing',
        attempts = attempts + 1,
        claimed_at = p_claimed_at,
        failed_at = NULL,
        failure_code = NULL
    WHERE id = p_deletion_id
      AND user_id = p_user_id
      AND (
        status IN ('scheduled', 'failed')
        OR (status = 'processing' AND claimed_at < p_claimed_at - interval '15 minutes')
      )
    RETURNING id INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_claim(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_claim(uuid, uuid, timestamptz) TO agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.privacy_record_failure(
  p_deletion_id uuid,
  p_user_id uuid,
  p_failure_code text,
  p_failed_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'privacy actor mismatch' USING ERRCODE = '42501';
  END IF;
  UPDATE public.privacy_deletion_requests
    SET status = 'failed',
        failure_code = left(p_failure_code, 80),
        failed_at = p_failed_at
    WHERE id = p_deletion_id
      AND user_id = p_user_id
      AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_record_failure(uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_record_failure(uuid, uuid, text, timestamptz) TO agentic_csv_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.privacy_complete(
  p_deletion_id uuid,
  p_user_id uuid,
  p_completed_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.privacy_deletion_requests%ROWTYPE;
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'privacy actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
    FROM public.privacy_deletion_requests
    WHERE id = p_deletion_id AND user_id = p_user_id
    FOR UPDATE;
  IF NOT FOUND OR v_request.status = 'completed' THEN RETURN; END IF;
  IF v_request.status <> 'processing' THEN
    RAISE EXCEPTION 'privacy deletion is not claimed' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.privacy_deletion_audits (
    id, subject_hash, resource_hash, scope, object_count, requested_at, completed_at
  ) VALUES (
    gen_random_uuid(),
    encode(digest(p_user_id::text, 'sha256'), 'hex'),
    CASE WHEN v_request.dataset_id IS NULL THEN NULL
      ELSE encode(digest(v_request.dataset_id::text, 'sha256'), 'hex') END,
    v_request.scope,
    jsonb_array_length(v_request.object_keys),
    v_request.requested_at,
    p_completed_at
  );

  IF v_request.scope = 'account' THEN
    DELETE FROM public.analysis_messages
      WHERE thread_id IN (
        SELECT id FROM public.analysis_threads WHERE user_id = p_user_id
      );
    DELETE FROM public.users WHERE id = p_user_id;
    RETURN;
  END IF;

  UPDATE public.conversations
    SET active_dataset_id = NULL,
        active_dataset_version_id = NULL,
        version = version + 1,
        updated_at = p_completed_at
    WHERE user_id = p_user_id
      AND active_dataset_id = v_request.dataset_id;

  DELETE FROM public.analysis_plans
    WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id;
  DELETE FROM public.analysis_messages
    WHERE thread_id IN (
      SELECT id FROM public.analysis_threads
        WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id
    );
  DELETE FROM public.analysis_threads
    WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id;
  DELETE FROM public.dataset_upload_intents
    WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id;
  DELETE FROM public.outbox_events
    WHERE user_id = p_user_id
      AND (
        aggregate_id = v_request.dataset_id
        OR aggregate_id IN (
          SELECT id FROM public.dataset_versions
            WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id
        )
      );
  DELETE FROM public.dataset_versions
    WHERE user_id = p_user_id AND dataset_id = v_request.dataset_id;

  UPDATE public.datasets
    SET name = 'Deleted dataset',
        original_filename = 'deleted.csv',
        object_key = NULL,
        status = 'deleted',
        row_count = NULL,
        column_count = NULL,
        failure_reason = NULL,
        active_version_id = NULL,
        deleted_at = p_completed_at,
        updated_at = p_completed_at
    WHERE user_id = p_user_id AND id = v_request.dataset_id;

  UPDATE public.privacy_deletion_requests
    SET status = 'completed',
        object_keys = '[]'::jsonb,
        completed_at = p_completed_at,
        failed_at = NULL,
        failure_code = NULL
    WHERE id = p_deletion_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_complete(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_complete(uuid, uuid, timestamptz) TO agentic_csv_app;

CREATE INDEX "privacy_deletion_requests_status_idx" ON "privacy_deletion_requests" USING btree ("status","requested_at");