CREATE OR REPLACE FUNCTION public.authenticate_api_key(p_key_hash text)
RETURNS TABLE(id uuid, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING api_keys.id, api_keys.user_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authenticate_api_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_api_key(text) TO agentic_csv_app;
REVOKE ALL ON TABLE public.api_keys FROM agentic_csv_app;
REVOKE ALL ON TABLE public.users FROM agentic_csv_app;
