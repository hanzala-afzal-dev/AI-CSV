CREATE UNIQUE INDEX "users_email_normalized_unique" ON "users" USING btree (lower("email")) WHERE "users"."email" is not null;
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
DECLARE normalized_email text := lower(btrim(p_email));
BEGIN
  IF normalized_email IS NULL OR normalized_email = '' THEN
    RETURN false;
  END IF;
  INSERT INTO public.users (id, email, display_name, password_hash, status)
  VALUES (
    p_user_id, normalized_email, p_display_name, p_password_hash, 'pending_verification'
  )
  ON CONFLICT DO NOTHING;
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
  WHERE u.email = lower(btrim(p_email)) AND u.password_hash IS NOT NULL
  LIMIT 1
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
    WHERE u.email = lower(btrim(p_email))
      AND u.email_verified_at IS NULL
      AND u.status = 'pending_verification'
  ), invalidated AS (
    UPDATE public.verification_tokens t SET consumed_at = p_now
    FROM target WHERE t.user_id = target.id AND t.purpose = 'initial' AND t.consumed_at IS NULL
  ), inserted AS (
    INSERT INTO public.verification_tokens (user_id, token_hash, purpose, expires_at)
    SELECT target.id, p_token_hash, 'initial', p_expires_at FROM target
    RETURNING user_id
  )
  SELECT target.email::text, target.display_name::text
  FROM target JOIN inserted ON inserted.user_id = target.id
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
    WHERE u.email = lower(btrim(p_email))
      AND u.status = 'active'
      AND u.email_verified_at IS NOT NULL
  ), invalidated AS (
    UPDATE public.password_reset_tokens t SET consumed_at = p_now
    FROM target WHERE t.user_id = target.id AND t.consumed_at IS NULL
  ), inserted AS (
    INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
    SELECT target.id, p_token_hash, p_expires_at FROM target
    RETURNING user_id
  )
  SELECT target.email::text, target.display_name::text
  FROM target JOIN inserted ON inserted.user_id = target.id
$$;
