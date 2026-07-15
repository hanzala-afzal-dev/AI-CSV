# Implementation Status

**Updated:** 2026-07-15

**Current target:** Phase 6 - deterministic analytics and charts

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Remaining work                                                                                                                                                                                                         |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Keep architecture documentation synchronized                                                                                                                                                                           |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, stable bind-mounted development containers with workspace watch builds, separate production Docker targets, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, LocalStack S3, typed env with template-drift validation, Docker runbook, structured logging, health/readiness                                                                                                                                                                                                                                                                                                                                           | Hosted CI remains explicitly out of scope; rebuild only after dependency or container-definition changes and rerun runtime smoke tests after infrastructure changes                                                    |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email with database-enforced normalized uniqueness; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI with async-safe form handling; unit/API/RLS isolation tests; registration, Mailpit delivery, verification, and production login smoke; production Docker build and runtime readiness                                              | Browser-level authentication and settings smoke verification is deferred; no known feature or API gap blocks Phase 3                                                                                                   |
| 3 - Secure OpenAI settings        | Implemented | Provider domain/application ports and strict contracts; opaque `SecretValue`; AES-256-GCM with random nonces, AAD and versioned keys; validate-before-replace OpenAI credentials; safe model/reasoning catalog; CSRF/origin and fail-closed Redis limits; redacted errors/logs; migration `0007` with RLS, column grants, actor-scoped secret reads and append-only audits; component-driven settings UI with loading, invalid, fallback, empty and delete states; unit/API/repository/RLS tests                                                                                                                                                     | Production deployments should replace the local master-key baseline with managed KMS envelope encryption and an operational re-encryption procedure; no known Phase 3 feature gap                                      |
| 4 - Persistent conversation shell | Implemented | Conversation domain/application boundary and strict contracts; UUIDv7 entity IDs; migration `0008` with conversation/message/run/event tables, composite ownership FKs, sequence and active-run constraints, RLS and least-privilege grants; cursor CRUD APIs; idempotent submission; transactional outbox; duplicate-safe BullMQ worker; deterministic assistant; durable paged SSE replay/cancel; Redis submission/stream/concurrency limits; component-driven responsive chat UI with search, archive, rename, delete, provider gate, loading/empty/error/stream states; unit/API/RLS and live Compose smoke                                      | The assistant is deliberately deterministic in this phase; CSV-backed responses begin in Phase 5 and real OpenAI/LangGraph execution begins in Phase 7                                                                 |
| 5 - CSV upload and profiling      | Implemented | Strict dataset/profile contracts with safe browser projections; versioned presigned S3 upload and checksum/metadata verification; idempotent completion and transactional outbox; migration `0009` with profile/column storage, active conversation version, composite ownership FKs, claims, forced RLS and narrow grants; bounded BullMQ retry and database claims; streaming UTF-8/binary/shape validation and resource-limited DuckDB profiling; durable list/detail/profile APIs; CSRF/origin and user/hashed-IP upload limits; reusable upload/progress/failure/profile UI; synthetic fixtures; unit/API/repository/RLS and live Compose smoke | Parquet normalization remains optional. Cross-resource dataset deletion is deferred to the queued privacy-deletion workflow, when vector/memory derivatives exist; it is not part of the approved Phase 5 upload slice |
| 6 - Deterministic analytics       | Planned     | DuckDB adapter dependency only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Analysis plan schema/compiler, bounded read-only execution, provenance, result and chart artifacts                                                                                                                     |
| 7 - Agent orchestration           | Scaffolded  | LangGraph package, state and compiling placeholder graph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Provider gateway, real graph nodes/tools, checkpoints, clarification/resume, verification, cancellation and streaming                                                                                                  |
| 8 - RAG and memory                | Scaffolded  | Qdrant client and version-controlled knowledge-base starter documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Load/index pipeline, tenant-filtered retrieval, dataset semantic documents, summaries and typed memory lifecycle                                                                                                       |
| 9 - Suggestions and hardening     | Partial     | OSS license/contribution/security documents and foundational unit tests exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Suggestions, evaluation artifacts, complete security acceptance suite, accessibility review, demo data and final smoke tests                                                                                           |

## Specification coverage

| Specs                                         | Coverage                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Partial; foundation rules apply, analytics/agent/credential rules await their phases               |
| 001 Product requirements                      | Partial; the complete MVP acceptance contract spans Phases 0-9                                     |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                                     |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                                  |
| 004                                           | Implemented in Phase 3                                                                             |
| 005 and conversation sections of 012/013/015  | Implemented in Phase 4                                                                             |
| 006 and dataset sections of 012/013/015       | Phase 5 upload/profile slice implemented; queued cross-resource deletion remains planned           |
| 008                                           | Planned in Phase 6                                                                                 |
| 007                                           | Scaffolded for Phase 7                                                                             |
| 009-010                                       | Scaffolded for Phase 8                                                                             |
| 011, 017-018                                  | Partial; completed in Phase 9                                                                      |
| 012-013 provider sections                     | Implemented in Phase 3                                                                             |
| 014                                           | Implemented foundation plus provider and conversation controls; later controls follow their phases |
| 016                                           | Identity, provider and conversation controls implemented; later capability controls remain         |
| 017                                           | Phase 5 unit, API, worker, repository, RLS, fixtures and runtime smoke coverage implemented        |
| 019                                           | Active delivery order and definition of done                                                       |
| 020                                           | Active execution contract                                                                          |

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
- Dataset create, upload-intent and completion mutations derive ownership from the authenticated actor,
  require trusted origin and session-bound CSRF for browsers, and use fail-closed per-user plus HMAC-hashed
  IP Redis buckets. Completion binds an idempotency key to a request hash; browser projections omit user
  IDs, object keys and durable storage locations.
- Original CSV objects use server-generated `users/{userId}/datasets/{datasetId}/versions/{versionId}`
  paths and short-lived method/checksum-constrained signed URLs. Workers treat queue payloads as routing
  hints, acquire a database claim, reload actor-owned state under RLS, and revalidate object metadata before
  reading. PostgreSQL composite foreign keys prevent cross-owner dataset/version association.
- CSV processing streams into randomized `0600` temporary files, verifies size and SHA-256, rejects binary
  and invalid UTF-8 content, and bounds bytes, logical row width, rows, columns, fields, malformed ratio,
  time, memory and DuckDB threads. DuckDB receives only the authorized temporary path, quoted identifiers
  and fixed profiler SQL; raw rows and signed URLs are not logged.
- Analytical SQL and agent tool execution are not implemented. Their allow-listing, read-only execution,
  result limits, and prompt-injection controls remain mandatory in Phases 6-7. CSV cell text is not supplied
  to the Phase 5 responder and is never interpreted as an instruction.

## Verification baseline

Last verified on 2026-07-15:

| Command/runtime check   | Result                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm quality`          | Passed: formatting, architecture, lint, typecheck, 131 unit/API tests and the production workspace build                                                     |
| `pnpm env:check`        | Passed; root `.env` contains every key documented by `.env.example`                                                                                          |
| Migration state         | `pnpm db:migrate` passed through `0009`; `pnpm db:generate` reports no schema changes                                                                        |
| `pnpm test:integration` | Passed: 30 PostgreSQL repository/RLS tests, including dataset profile isolation, composite-FK denial, claims, idempotency, event replay and immutability     |
| `pnpm docker:config`    | Passed with scoped service environments, upload limits, LocalStack browser CORS, encryption configuration and Mailpit                                        |
| Full Compose runtime    | One-time targeted worker image build passed; web healthy, worker active on dataset/agent queues, infrastructure healthy and migration exited 0               |
| Phase 5 runtime smoke   | Disposable register/verify/login, CSRF conversation/dataset creation, signed direct PUT, completion/outbox, worker profile, ready reload and response passed |
| Provider integration    | OpenAI model-list behavior remains covered at a mocked HTTP boundary; Phase 4 never sends the saved key to its deterministic responder                       |

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

Implement Phase 6 as one deterministic analysis-to-chart vertical slice:

1. Define versioned `AnalysisPlan`, result artifact, provenance and `ChartSpec` contracts. Plans use an
   allow-listed operation vocabulary, typed filters/grouping/aggregations and stored dataset-column IDs;
   they never contain executable SQL or arbitrary file paths.
2. Add tenant-owned analysis/result tables with composite dataset-version ownership, forced RLS, narrow
   grants, bounded JSON checks and immutable completed artifacts. Add repository/API Alice/Bob tests before
   exposing result reads.
3. Build a deterministic compiler that validates requested columns and types against the Phase 5 profile,
   emits only quoted/parameterized read-only DuckDB queries, and rejects extensions, external access,
   multiple statements and unsupported operations before execution.
4. Execute against only the authorized immutable CSV version with strict time, memory, thread, scan and
   result-row/byte limits. Persist row schema, bounded rows or an object-backed artifact, checksum,
   execution timing, truncation, assumptions and full provenance separately from message text.
5. Add trusted table/bar/line/pie/scatter React renderers for validated `ChartSpec` values, including
   loading, no-row, incompatible-type, truncation and timeout states. Prove the slice with golden numerical
   fixtures, compiler rejection tests, result/provenance persistence, chart field validation, reload and
   cross-tenant denial.

Phase 6 remains deterministic and does not call the LLM or introduce LangGraph, embeddings or memory.
Those remain Phases 7-8. Phase 2 Playwright verification remains deferred by product direction; manual
Phase 5 browser checks are documented in `docs/phase-5-e2e.md`.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
