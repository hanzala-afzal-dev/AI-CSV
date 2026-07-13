CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"csrf_hash" varchar(64) NOT NULL,
	"user_agent" varchar(255),
	"ip_hash" varchar(64),
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"pending_email" varchar(320),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_unique" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_purpose_idx" ON "verification_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "verification_tokens_expiry_idx" ON "verification_tokens" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_rotated_from_id_fk"
  FOREIGN KEY ("rotated_from_id") REFERENCES "sessions"("id") ON DELETE SET NULL;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expiry_order_check"
  CHECK ("idle_expires_at" <= "absolute_expires_at");
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" IS NULL OR "email" = lower(btrim("email")));
ALTER TABLE "users" ADD CONSTRAINT "users_pending_email_normalized_check"
  CHECK ("pending_email" IS NULL OR "pending_email" = lower(btrim("pending_email")));
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_purpose_check"
  CHECK ("purpose" IN ('initial', 'email_change'));
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self_isolation" ON "users"
  USING ("id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_user_isolation" ON "sessions"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verification_tokens_user_isolation" ON "verification_tokens"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "password_reset_tokens_user_isolation" ON "password_reset_tokens"
  USING ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_register(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_password_hash text,
  p_verification_hash text,
  p_verification_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, password_hash, status)
  VALUES (p_user_id, p_email, p_display_name, p_password_hash, 'pending_verification')
  ON CONFLICT (email) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.verification_tokens (user_id, token_hash, purpose, expires_at)
  VALUES (p_user_id, p_verification_hash, 'initial', p_verification_expires_at);
  RETURN true;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_find_login(p_email text)
RETURNS TABLE(user_id uuid, email text, display_name text, password_hash text, status text, email_verified boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.email::text, u.display_name::text, u.password_hash, u.status::text,
         u.email_verified_at IS NOT NULL
  FROM public.users u
  WHERE u.email = p_email AND u.password_hash IS NOT NULL
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_create_session(
  p_session_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_csrf_hash text,
  p_user_agent text,
  p_ip_hash text,
  p_idle_expires_at timestamptz,
  p_absolute_expires_at timestamptz,
  p_rotated_from_id uuid,
  p_now timestamptz
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH inserted AS (
    INSERT INTO public.sessions (
      id, user_id, token_hash, csrf_hash, user_agent, ip_hash, idle_expires_at,
      absolute_expires_at, rotated_from_id, last_seen_at, created_at
    )
    SELECT p_session_id, u.id, p_token_hash, p_csrf_hash, left(p_user_agent, 255), p_ip_hash,
           p_idle_expires_at, p_absolute_expires_at, p_rotated_from_id, p_now, p_now
    FROM public.users u
    WHERE u.id = p_user_id AND u.status = 'active' AND u.email_verified_at IS NOT NULL
    RETURNING id
  ) SELECT EXISTS(SELECT 1 FROM inserted)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_authenticate_session(
  p_token_hash text,
  p_now timestamptz,
  p_idle_ttl_seconds integer
) RETURNS TABLE(
  id uuid, user_id uuid, csrf_hash text, created_at timestamptz, last_seen_at timestamptz,
  idle_expires_at timestamptz, absolute_expires_at timestamptz, email text,
  pending_email text, display_name text, email_verified boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH valid_session AS (
    UPDATE public.sessions s
    SET last_seen_at = p_now,
        idle_expires_at = LEAST(p_now + make_interval(secs => p_idle_ttl_seconds), s.absolute_expires_at)
    WHERE s.token_hash = p_token_hash
      AND s.revoked_at IS NULL
      AND s.idle_expires_at > p_now
      AND s.absolute_expires_at > p_now
    RETURNING s.*
  )
  SELECT s.id, s.user_id, s.csrf_hash::text, s.created_at, s.last_seen_at,
         s.idle_expires_at, s.absolute_expires_at, u.email::text, u.pending_email::text,
         u.display_name::text, u.email_verified_at IS NOT NULL
  FROM valid_session s
  JOIN public.users u ON u.id = s.user_id
  WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_revoke_session(p_token_hash text, p_now timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.sessions SET revoked_at = COALESCE(revoked_at, p_now)
  WHERE token_hash = p_token_hash
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_issue_verification(
  p_email text, p_token_hash text, p_expires_at timestamptz, p_now timestamptz
) RETURNS TABLE(email text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH target AS (
    SELECT u.id, u.email, u.display_name FROM public.users u
    WHERE u.email = p_email AND u.email_verified_at IS NULL AND u.status = 'pending_verification'
  ), invalidated AS (
    UPDATE public.verification_tokens t SET consumed_at = p_now
    FROM target WHERE t.user_id = target.id AND t.purpose = 'initial' AND t.consumed_at IS NULL
  ), inserted AS (
    INSERT INTO public.verification_tokens (user_id, token_hash, purpose, expires_at)
    SELECT target.id, p_token_hash, 'initial', p_expires_at FROM target
    RETURNING user_id
  )
  SELECT target.email::text, target.display_name::text FROM target JOIN inserted ON inserted.user_id = target.id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_consume_verification(p_token_hash text, p_now timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE token_row public.verification_tokens%ROWTYPE;
BEGIN
  SELECT * INTO token_row FROM public.verification_tokens
  WHERE token_hash = p_token_hash AND consumed_at IS NULL AND expires_at > p_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF token_row.purpose = 'initial' THEN
    UPDATE public.users SET email_verified_at = p_now, status = 'active', updated_at = p_now
    WHERE id = token_row.user_id AND email_verified_at IS NULL;
  ELSIF token_row.purpose = 'email_change' THEN
    UPDATE public.users SET email = token_row.pending_email, pending_email = NULL,
      email_verified_at = p_now, updated_at = p_now
    WHERE id = token_row.user_id AND pending_email = token_row.pending_email;
  ELSE
    RETURN false;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.verification_tokens SET consumed_at = p_now WHERE id = token_row.id;
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_issue_password_reset(
  p_email text, p_token_hash text, p_expires_at timestamptz, p_now timestamptz
) RETURNS TABLE(email text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH target AS (
    SELECT u.id, u.email, u.display_name FROM public.users u
    WHERE u.email = p_email AND u.status = 'active' AND u.email_verified_at IS NOT NULL
  ), invalidated AS (
    UPDATE public.password_reset_tokens t SET consumed_at = p_now
    FROM target WHERE t.user_id = target.id AND t.consumed_at IS NULL
  ), inserted AS (
    INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
    SELECT target.id, p_token_hash, p_expires_at FROM target
    RETURNING user_id
  )
  SELECT target.email::text, target.display_name::text FROM target JOIN inserted ON inserted.user_id = target.id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_reset_password(p_token_hash text, p_password_hash text, p_now timestamptz)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH consumed AS (
    UPDATE public.password_reset_tokens SET consumed_at = p_now
    WHERE token_hash = p_token_hash AND consumed_at IS NULL AND expires_at > p_now
    RETURNING user_id
  ), changed AS (
    UPDATE public.users u SET password_hash = p_password_hash, updated_at = p_now
    FROM consumed WHERE u.id = consumed.user_id RETURNING u.id
  ), revoked AS (
    UPDATE public.sessions s SET revoked_at = p_now
    FROM changed WHERE s.user_id = changed.id AND s.revoked_at IS NULL
  ) SELECT EXISTS(SELECT 1 FROM changed)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.identity_register(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_find_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_create_session(uuid, uuid, text, text, text, text, timestamptz, timestamptz, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_authenticate_session(text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_revoke_session(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_issue_verification(text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_consume_verification(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_issue_password_reset(text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_reset_password(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_register(uuid, text, text, text, text, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_find_login(text) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_create_session(uuid, uuid, text, text, text, text, timestamptz, timestamptz, uuid, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_authenticate_session(text, timestamptz, integer) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_revoke_session(text, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_issue_verification(text, text, timestamptz, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_consume_verification(text, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_issue_password_reset(text, text, timestamptz, timestamptz) TO agentic_csv_app;
GRANT EXECUTE ON FUNCTION public.identity_reset_password(text, text, timestamptz) TO agentic_csv_app;
GRANT SELECT, UPDATE ON TABLE public.users TO agentic_csv_app;
GRANT SELECT, UPDATE ON TABLE public.sessions TO agentic_csv_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.verification_tokens TO agentic_csv_app;
REVOKE ALL ON TABLE public.password_reset_tokens FROM agentic_csv_app;
