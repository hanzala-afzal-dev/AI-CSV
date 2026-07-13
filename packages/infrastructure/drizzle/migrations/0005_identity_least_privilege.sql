REVOKE ALL ON TABLE public.users FROM agentic_csv_app;
GRANT SELECT (id, email, pending_email, display_name, password_hash, email_verified_at, status, created_at, updated_at)
  ON TABLE public.users TO agentic_csv_app;
GRANT UPDATE (display_name, pending_email, password_hash, updated_at)
  ON TABLE public.users TO agentic_csv_app;
--> statement-breakpoint
REVOKE ALL ON TABLE public.sessions FROM agentic_csv_app;
GRANT SELECT (id, user_id, user_agent, idle_expires_at, absolute_expires_at, last_seen_at, revoked_at, rotated_from_id, created_at)
  ON TABLE public.sessions TO agentic_csv_app;
GRANT UPDATE (csrf_hash, revoked_at) ON TABLE public.sessions TO agentic_csv_app;
--> statement-breakpoint
REVOKE ALL ON TABLE public.verification_tokens FROM agentic_csv_app;
GRANT SELECT (user_id, purpose, consumed_at) ON TABLE public.verification_tokens TO agentic_csv_app;
GRANT INSERT ON TABLE public.verification_tokens TO agentic_csv_app;
GRANT UPDATE (consumed_at) ON TABLE public.verification_tokens TO agentic_csv_app;
--> statement-breakpoint
REVOKE ALL ON TABLE public.password_reset_tokens FROM agentic_csv_app;
