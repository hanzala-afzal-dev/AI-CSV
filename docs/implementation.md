# Implementation Status

**Updated:** 2026-07-13

**Current target:** Phase 5 - CSV upload and profiling

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Remaining work                                                                                                                                                                     |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Keep architecture documentation synchronized                                                                                                                                       |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, stable bind-mounted development containers with workspace watch builds, separate production Docker targets, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, LocalStack S3, typed env with template-drift validation, Docker runbook, structured logging, health/readiness                                                                                                                                                                                                                                                                                                      | Hosted CI remains explicitly out of scope; rebuild only after dependency or container-definition changes and rerun runtime smoke tests after infrastructure changes                |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email with database-enforced normalized uniqueness; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI with async-safe form handling; unit/API/RLS isolation tests; registration, Mailpit delivery, verification, and production login smoke; production Docker build and runtime readiness         | Browser-level authentication and settings smoke verification is deferred; no known feature or API gap blocks Phase 3                                                               |
| 3 - Secure OpenAI settings        | Implemented | Provider domain/application ports and strict contracts; opaque `SecretValue`; AES-256-GCM with random nonces, AAD and versioned keys; validate-before-replace OpenAI credentials; safe model/reasoning catalog; CSRF/origin and fail-closed Redis limits; redacted errors/logs; migration `0007` with RLS, column grants, actor-scoped secret reads and append-only audits; component-driven settings UI with loading, invalid, fallback, empty and delete states; unit/API/repository/RLS tests                                                                                                                | Production deployments should replace the local master-key baseline with managed KMS envelope encryption and an operational re-encryption procedure; no known Phase 3 feature gap  |
| 4 - Persistent conversation shell | Implemented | Conversation domain/application boundary and strict contracts; UUIDv7 entity IDs; migration `0008` with conversation/message/run/event tables, composite ownership FKs, sequence and active-run constraints, RLS and least-privilege grants; cursor CRUD APIs; idempotent submission; transactional outbox; duplicate-safe BullMQ worker; deterministic assistant; durable paged SSE replay/cancel; Redis submission/stream/concurrency limits; component-driven responsive chat UI with search, archive, rename, delete, provider gate, loading/empty/error/stream states; unit/API/RLS and live Compose smoke | The assistant is deliberately deterministic in this phase; CSV-backed responses begin in Phase 5 and real OpenAI/LangGraph execution begins in Phase 7                             |
| 5 - CSV upload and profiling      | Partial     | Dataset aggregate, versioned presigned upload, S3 metadata verification, idempotent completion, transactional outbox, and versioned BullMQ payload                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Worker ownership reload, defensive CSV validation, DuckDB profile, optional Parquet, lifecycle completion, list/detail/profile APIs, progress/error UI and storage isolation tests |
| 6 - Deterministic analytics       | Planned     | DuckDB adapter dependency only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Analysis plan schema/compiler, bounded read-only execution, provenance, result and chart artifacts                                                                                 |
| 7 - Agent orchestration           | Scaffolded  | LangGraph package, state and compiling placeholder graph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Provider gateway, real graph nodes/tools, checkpoints, clarification/resume, verification, cancellation and streaming                                                              |
| 8 - RAG and memory                | Scaffolded  | Qdrant client and version-controlled knowledge-base starter documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Load/index pipeline, tenant-filtered retrieval, dataset semantic documents, summaries and typed memory lifecycle                                                                   |
| 9 - Suggestions and hardening     | Partial     | OSS license/contribution/security documents and foundational unit tests exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Suggestions, evaluation artifacts, complete security acceptance suite, accessibility review, demo data and final smoke tests                                                       |

## Specification coverage

| Specs                                         | Coverage                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Partial; foundation rules apply, analytics/agent/credential rules await their phases                |
| 001 Product requirements                      | Partial; the complete MVP acceptance contract spans Phases 0-9                                      |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                                      |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                                   |
| 004                                           | Implemented in Phase 3                                                                              |
| 005 and conversation sections of 012/013/015  | Implemented in Phase 4                                                                              |
| 006 and dataset sections of 012/013/015       | Partial in Phase 5                                                                                  |
| 008                                           | Planned in Phase 6                                                                                  |
| 007                                           | Scaffolded for Phase 7                                                                              |
| 009-010                                       | Scaffolded for Phase 8                                                                              |
| 011, 017-018                                  | Partial; completed in Phase 9                                                                       |
| 012-013 provider sections                     | Implemented in Phase 3                                                                              |
| 014                                           | Implemented foundation plus provider and conversation controls; later controls follow their phases  |
| 016                                           | Identity, provider and conversation controls implemented; later capability controls remain          |
| 017                                           | Phase 4 unit, API, repository, RLS and runtime smoke coverage implemented; later evaluations remain |
| 019                                           | Active delivery order and definition of done                                                        |
| 020                                           | Active execution contract                                                                           |

## Current security posture

- Browser authentication uses Argon2id passwords and persisted opaque sessions. PostgreSQL stores only
  keyed token hashes. Cookies are HTTP-only, secure in production, SameSite strict, and bounded by idle
  and absolute expiry.
- Cookie-authenticated mutations require JSON, trusted Origin/Referer, and a rotating session-bound CSRF
  token. Authentication and recovery limits use hashed IP, identifier, and authenticated-account buckets
  and fail closed when Redis is unavailable.
- Identity tables use RLS, narrow security-definer functions for pre-authentication work, and column-level
  application-role grants. Browser email addresses are normalized in the domain and security-definer
  database functions, with a unique index on `lower(email)` as defense in depth. Existing bearer keys
  remain CLI/server credentials only.
- Registration uses the same accepted response for new and existing addresses. Duplicate submissions do
  not create another user or verification token, and the UI directs returning users to sign-in or password
  recovery without disclosing whether an account exists.
- OpenAI keys are accepted only by a strict authenticated mutation contract, validated server-side, held
  behind an opaque non-serializable value, and stored using AES-256-GCM with per-record AAD and versioned
  256-bit keys. Reads return only status, timestamps and the last four characters.
- Provider mutations require trusted Origin/Referer and session-bound CSRF. Credential validation, model
  catalog reads and preference access validation share a low fail-closed Redis bucket derived from the
  authenticated user, while sensitive endpoint errors omit raw messages and stacks from logs.
- Provider credentials, preferences and audit events use RLS. The application role cannot select
  ciphertext directly; a security-definer function returns one actor-scoped encrypted record to the
  dedicated repository. Audit metadata is allow-listed and audit rows are append-only to the app role.
- Conversation, message, run and run-event rows carry tenant ownership with composite foreign keys and
  forced RLS. Application queries set a transaction-local actor, foreign ownership is returned as the
  same safe `404`, and finalized messages and persisted events are immutable to the application role.
- Chat mutations derive ownership only from the authenticated session, reject unknown input fields,
  require trusted origin and session-bound CSRF, and use a dedicated fail-closed Redis limit. A database
  partial unique index enforces one active run per conversation, while client request IDs and queued-only
  worker claims prevent duplicate execution.
- SSE connections are ownership checked and have separate request and concurrent-lease limits. Events
  are persisted before delivery with monotonic per-run sequence numbers, paged replay supports
  `Last-Event-ID`, and reconnects cannot manufacture or reorder canonical messages.
- Analytical SQL and agent tool execution are not implemented. Their allow-listing, read-only execution,
  resource limits, and prompt-injection controls remain mandatory in Phases 6-7.

## Verification baseline

Last verified on 2026-07-13:

| Command/runtime check   | Result                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm quality`          | Passed: formatting, architecture, lint, typecheck, 101 unit/API tests and the production workspace build                                                      |
| `pnpm env:check`        | Passed; root `.env` contains every key documented by `.env.example`                                                                                           |
| Migration state         | `pnpm db:migrate` passed; Drizzle journal and local database are current through `0008`                                                                       |
| `pnpm test:integration` | Passed: 24 PostgreSQL repository/RLS tests, including conversation Alice/Bob isolation, composite-FK denial, idempotency, event replay and immutability       |
| `pnpm docker:config`    | Passed with scoped service environments, encryption configuration and Mailpit                                                                                 |
| Full Compose runtime    | Required one-time dependency image rebuild passed; web healthy, worker active on dataset and agent queues, infrastructure healthy and migration exited 0      |
| Conversation smoke      | Disposable register/verify/login, CSRF create/submit, outbox worker, ordered SSE replay, persisted reload and authenticated workspace/settings renders passed |
| Provider integration    | OpenAI model-list behavior remains covered at a mocked HTTP boundary; Phase 4 never sends the saved key to its deterministic responder                        |

Run before changing a phase status:

```bash
pnpm quality
pnpm test:integration
pnpm docker:config
pnpm docker:ps
```

The local PostgreSQL volume must have all committed migrations before the RLS suite runs. If the suite
reports a missing column introduced by a committed migration, run `pnpm db:migrate` and rerun the suite;
do not treat skipped isolation tests as a pass.

## Next implementation slice

Implement Phase 5 as one complete CSV ingestion vertical slice:

1. Reconcile the existing dataset/upload foundations with Specs 006, 012 and 013. Add any missing
   tenant-owned profile/column schema, composite ownership constraints, lifecycle checks, indexes, RLS
   and least-privilege grants before exposing new reads.
2. Finish authenticated dataset list/detail/profile APIs and upload intent/completion controls. Every
   mutation must use strict contracts, session-derived ownership, trusted origin, CSRF, idempotency and
   dedicated Redis limits; signed object keys remain server generated.
3. Build the reusable CSV attachment and dataset-status UI into the current empty chat workspace. Support
   file selection, direct presigned upload, completion, persistent validating/profiling/failed/ready states,
   accessible progress, retry, configured limits and safe validation errors.
4. Implement the worker from the database outward: reload actor ownership and object metadata, download
   only the authorized key, detect encoding/delimiter, reject binary or malformed input, apply byte/row/
   column/field limits, and produce a versioned DuckDB profile without logging raw rows. Mark permanent
   validation failures terminal and retry only transient storage/database failures.
5. Persist profile/column summaries and schema-based prompt suggestions, then prove valid/invalid CSV
   lifecycle, upload idempotency, object-path isolation, Alice/Bob API/RLS isolation, worker duplicate
   delivery, restart/reload behavior and cleanup of temporary files.

Do not add free-running analytical SQL, charts, LangGraph execution, embeddings or memory in this slice.
Those remain Phases 6-8. Phase 2 Playwright verification remains deferred by product direction.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
