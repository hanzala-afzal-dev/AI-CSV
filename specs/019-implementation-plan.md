# 019 — Implementation Plan and Definition of Done

**Status:** Approved for implementation

## Phase 0 — Reconcile existing repository

- Inspect existing React frontend and preserve correct work.
- Confirm Next.js versus separate React SPA architecture.
- Establish monorepo/workspace boundaries without unnecessary rewrite.
- Add spec index, ADR template and dependency rules.

**Done when:** existing frontend runs and architecture decision is documented.

## Phase 1 — Platform foundation

- Strict TypeScript, lint, format, tests and a CI-equivalent local validation command.
- Dockerfiles and Docker Compose.
- PostgreSQL, Redis, Qdrant, S3-compatible storage and worker.
- Typed env configuration.
- Structured logging and health/readiness.
- Drizzle migrations and base operational tables.

**Done when:** `docker compose up -d --build` produces healthy services and the local quality gate runs from the lockfile. Hosted CI is optional until explicitly enabled.

## Phase 2 — Identity and tenant boundary

- Email/password auth, sessions, verification/reset.
- Profile/email/password settings.
- User-scoped repositories and RLS.
- Tenant isolation integration suite.
- CSRF, authentication rate limits, secure cookies and session rotation ship with the first auth endpoint.

**Done when:** Alice/Bob tests prove isolation across APIs and database policies.

## Phase 3 — Secure OpenAI settings

- Credential encryption service.
- OpenAI credential add/replace/delete/validate.
- Model catalog and selected model/reasoning settings.
- Redaction and audit events.
- Credential-validation rate limiting and CSRF coverage.

**Done when:** plaintext key appears nowhere after request handling and the UI displays only safe metadata.

## Phase 4 — Persistent conversation shell

- Chat-style frontend layout.
- Conversation CRUD/sidebar.
- Message/run/event persistence.
- SSE run stream and reconnect.
- Settings navigation.
- Chat submission/SSE concurrency limits and relevant CSRF/session checks.

**Done when:** a mocked assistant conversation survives reload/sign-out/sign-in.

## Phase 5 — CSV upload and profiling

- Presigned CSV upload.
- Dataset/version aggregates.
- BullMQ ingestion worker.
- DuckDB validation/profile and optional Parquet normalization.
- Dataset status UI and suggestions based on schema.
- Upload intent/completion rate limits and CSRF coverage.

**Done when:** a valid CSV reaches `ready`, invalid files fail safely, and tenant storage isolation tests pass.

## Phase 6 — Deterministic analytical pipeline

- AnalysisPlan schema.
- Deterministic plan-to-query compiler.
- Read-only bounded DuckDB execution.
- Result/provenance artifact.
- ChartSpec and React renderers.

**Done when:** golden numerical questions work without a free-running agent.

## Phase 7 — LangChain and LangGraph orchestration

- Model gateway using user credential/preferences.
- Graph state/nodes/tools/checkpointing.
- Clarification interrupt/resume.
- Verification, bounded repair and cancellation.
- Streaming progress.

**Done when:** ambiguous golden case pauses, resumes and produces correct chart after reload.

## Phase 8 — RAG and memory

- Knowledge-base loader.
- Dataset semantic documents.
- Qdrant indexing/filtering.
- Conversation summary and typed memories.
- Memory deletion/version rules.

**Done when:** a confirmed business rule improves a plan and cross-tenant/version retrieval tests stay at zero leakage.

## Phase 9 — Suggestions, hardening and portfolio polish

- Follow-up suggestions and optional verified insights.
- Final security-header, rate-limit and audit-coverage review; endpoint protections already shipped in their owning phases.
- Evaluation dashboard/report artifacts.
- Accessibility review.
- Open-source documentation and demo data.

**Done when:** all constitution rules, acceptance tests, the CI-equivalent local gate and documented manual smoke tests pass.

## Global definition of done

A feature is not done until:

- specification and acceptance criteria are current;
- domain/application boundaries are respected;
- runtime schemas exist;
- authorization is tested;
- failure/loading/empty states exist;
- logs are safe;
- migrations are checked in;
- unit/integration/eval coverage is added;
- documentation reflects implementation status.
