# 014 — Infrastructure and Operations

**Status:** Approved for implementation

## 1. Docker Compose services

Required local services:

- `web` — existing React/Next.js application or BFF
- `api` — only when frontend is a separate SPA
- `worker` — BullMQ consumers and scheduled jobs
- `postgres` — transactional store, optionally pgvector extension but Qdrant remains primary vector store
- `redis` — queues, rate limits and ephemeral coordination
- `qdrant` — vector database
- `minio` or LocalStack S3 — object storage
- optional mail catcher for verification/reset development

DuckDB is embedded in `worker`/analysis process and does not need a Compose service.

## 2. Docker commands

The repository exposes explicit root-level commands:

```bash
pnpm docker:build
pnpm docker:up
pnpm docker:up:build
pnpm docker:stop
pnpm docker:start
pnpm docker:ps
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

These scripts call `docker compose --env-file .env -f docker/compose.yaml` explicitly. Direct commands
from `docker/` use the auto-discovered `compose.yaml`, which loads the root `.env` before interpolating
the ignored local `stack.yml`. The complete lifecycle is documented in
[`docker/README.md`](../../docker/README.md).

The normal daily lifecycle for already-created containers is `pnpm docker:stop` followed by
`pnpm docker:start`. Use `pnpm docker:up` only to create missing containers or reconcile Compose
configuration; it does not rebuild unless explicitly requested.

Local application services use dedicated development image targets with bind-mounted source and workspace
watch tasks. Changes to application or package source must be reflected without rebuilding or replacing
the `web` or `worker` container. Image rebuilds are reserved for dependency manifests, lockfile changes,
Dockerfiles, and base/system dependency changes. Compose environment, command, health-check, and
mounted-path changes require a one-time `docker:up` reconciliation of affected containers without an
image build. Production standalone images remain separate Docker targets and `pnpm build` remains the
routine compile check.

## 3. Environment configuration

`.env.example` contains no real secret and documents:

- database URL/components
- Redis URL
- Qdrant URL/collection
- S3 endpoint, bucket and local credentials
- auth/session secret
- `APP_ENCRYPTION_KEY`, its current version, optional previous-key map and generation instructions
- upload/query limits
- queue concurrency
- model defaults
- logging/tracing flags

Runtime env is parsed once through Zod and fails fast. Browser-exposed variables use an explicit public prefix and never include secrets.

## 4. Queues

BullMQ requirements:

- distinct queues by workload class;
- explicit concurrency;
- exponential backoff with jitter;
- dead-letter/final-failure visibility;
- idempotency keys;
- graceful shutdown;
- stalled-job handling;
- job progress persisted for user-visible workflows;
- no unbounded retries.

## 5. Rate limiting

Redis-backed sliding window or token bucket.

Minimum policies, configurable:

- login/password reset: by IP and account identifier
- API credential validation: per user, low limit
- CSV upload intent/completion: per user and IP
- chat submission: per user
- concurrent active agent runs: one per conversation and bounded per user
- SSE connections: bounded per user

Return `429` with `Retry-After`. Never use client-provided user IDs as rate-limit identity.

Rate limiting is delivered with the phase that first exposes each endpoint. It is not deferred to a
final hardening phase. Redis-backed enforcement fails closed for security-sensitive mutations; any
documented availability fallback must remain bounded and must not permit unlimited credential or agent calls.

The initial provider-validation policy is configurable through
`RATE_LIMIT_CREDENTIAL_VALIDATION_MAX_REQUESTS` and defaults to five attempts per configured rate-limit
window. Credential save, revalidation, model-catalog refresh and preference access validation share this
authenticated-user bucket.

Conversation controls are independently configurable:

- `RATE_LIMIT_CHAT_SUBMISSION_MAX_REQUESTS` limits accepted prompts per user/window;
- `RATE_LIMIT_SSE_CONNECTION_MAX_REQUESTS` limits stream opens per user/window;
- `SSE_MAX_CONNECTIONS_PER_USER` bounds simultaneous streams with fail-closed Redis leases;
- `SSE_CONNECTION_LEASE_SECONDS` must exceed the server's bounded stream lifetime.

The one-active-run invariant is enforced in PostgreSQL in addition to HTTP rate limits. Queue workers
atomically claim only `queued` runs, so duplicate transport delivery cannot repeat assistant work.

## 6. Health

- `/api/health`: process running; no external dependency checks.
- `/api/ready`: required dependencies reachable and migrations compatible.
- Worker readiness includes PostgreSQL, Redis and required queue registration.
- Qdrant/object storage may be required based on feature flags.

Compose health checks and dependency conditions must be defined.

## 7. Logging and tracing

Structured JSON logs with:

- timestamp, level, service, environment
- request/correlation ID
- user ID hashed/pseudonymous where possible
- conversation/run/job IDs
- event/action
- duration and safe error code

Redact:

- authorization/cookie headers
- passwords and tokens
- provider keys
- encrypted secret fields
- raw CSV rows
- object signed URLs

OpenTelemetry/LangSmith integration may be optional. It must not export secrets or private CSV content by default.

## 8. Database migrations

- Drizzle ORM for typed persistence.
- Checked-in SQL migrations.
- Migration applied as an explicit deployment step, not concurrently by every app replica.
- CI tests migration from empty database.
- Destructive migrations require migration plan and backup note.

## 9. Backups and retention

Document:

- PostgreSQL backup expectations
- object-storage lifecycle
- vector re-build capability
- user deletion workflow
- development volume reset

## 10. Resource limits

Configurable limits include:

- CSV bytes, rows, columns and field length
- query timeout/memory/thread count
- maximum returned rows
- prompt/message length
- agent steps/tool calls
- queue concurrency
- conversation context budget
