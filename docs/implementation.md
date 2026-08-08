# Implementation Status

**Updated:** 2026-08-09

**Current target:** Phase 8 - tenant-filtered RAG and typed memory

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Remaining work                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep architecture documentation synchronized                                                                                                                                                                                                                   |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, stable bind-mounted development containers with workspace watch builds, separate production Docker targets, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, persistent MinIO S3, typed env with template-drift validation, Docker runbook, structured logging, health/readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Hosted CI remains explicitly out of scope; rebuild only after dependency or container-definition changes and rerun runtime smoke tests after infrastructure changes                                                                                            |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email with database-enforced normalized uniqueness; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI with async-safe form handling; unit/API/RLS isolation tests; registration, Mailpit delivery, verification, and production login smoke; production Docker build and runtime readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Browser-level authentication and settings smoke verification is deferred; no known feature or API gap blocks Phase 3                                                                                                                                           |
| 3 - Secure OpenAI settings        | Implemented | Provider domain/application ports and strict contracts; opaque `SecretValue`; AES-256-GCM with random nonces, AAD and versioned keys; validate-before-replace OpenAI credentials; safe model/reasoning catalog; CSRF/origin and fail-closed Redis limits; redacted errors/logs; migration `0007` with RLS, column grants, actor-scoped secret reads and append-only audits; component-driven settings UI with loading, invalid, fallback, empty and delete states; unit/API/repository/RLS tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Production deployments should replace the local master-key baseline with managed KMS envelope encryption and an operational re-encryption procedure; no known Phase 3 feature gap                                                                              |
| 4 - Persistent conversation shell | Implemented | Conversation domain/application boundary and strict contracts; UUIDv7 entity IDs; migration `0008` with conversation/message/run/event tables, composite ownership FKs, sequence and active-run constraints, RLS and least-privilege grants; cursor CRUD APIs; idempotent submission; transactional outbox; duplicate-safe BullMQ worker; deterministic assistant; durable paged SSE replay/cancel; Redis submission/stream/concurrency limits; component-driven responsive chat UI with search, archive, rename, delete, provider gate, loading/empty/error/stream states; unit/API/RLS and live Compose smoke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The assistant is deliberately deterministic in this phase; CSV-backed responses begin in Phase 5 and real OpenAI/LangGraph execution begins in Phase 7                                                                                                         |
| 5 - CSV upload and profiling      | Implemented | Strict dataset/profile contracts with safe browser projections; versioned presigned S3 upload with provider-strict signed content type, checksum and intent metadata headers; checksum/metadata verification; idempotent completion and transactional outbox; migration `0009` with profile/column storage, active conversation version, composite ownership FKs, claims, forced RLS and narrow grants; bounded BullMQ retry and database claims; streaming UTF-8/binary/shape validation and resource-limited DuckDB profiling; durable list/detail/profile APIs; CSRF/origin and user/hashed-IP upload limits; reusable upload/progress/failure/profile UI with persistent direct-upload errors, timeout handling and retry; synthetic fixtures; unit/API/repository/RLS and live Compose smoke                                                                                                                                                                                                                                                                                                                                                                                  | Parquet normalization remains optional. Cross-resource dataset deletion is deferred to the queued privacy-deletion workflow, when vector/memory derivatives exist; it is not part of the approved Phase 5 upload slice                                         |
| 6 - Deterministic analytics       | Implemented | Versioned strict `AnalysisPlan`, result, provenance and `ChartSpec` contracts; deterministic common-question planner; allow-listed compiler with stored column IDs, quoted identifiers and bound filters; controlled immutable S3 source verification with typed missing/unavailable source failures; memory/thread/time/scan/row/byte-bounded DuckDB execution with external access disabled before compiled SQL; migration `0010` with immutable plan/result/chart artifacts, composite ownership FKs, bounded JSON, forced RLS and narrow grants; atomic message/artifact persistence; ownership-safe result API; trusted accessible table/bar/line/pie/scatter renderers with loading, empty, truncation, provenance and retry states; golden numeric, compiler-injection, chart-validation, API and Alice/Bob RLS tests                                                                                                                                                                                                                                                                                                                                                       | No Phase 6 blocker. The deterministic phrase planner intentionally covers common unambiguous requests; nuanced intent, natural-language filter extraction, clarification and explanation generation belong to the bounded Phase 7 graph                        |
| 7 - Agent orchestration           | Implemented | One explicit versioned LangGraph workflow; actor-injected state; OpenAI-compatible required-nullable structured planning/explanation through the user's encrypted credential and persisted model snapshot; provider-wire structural validation separated from semantic plan validation so operation-shape errors use bounded schema-grounded repair; repair rules supplied as trusted planning metadata; repair of false unsupported decisions into clarification; role-aware binding of answered clarification columns; capability prose constrained by trusted contract metadata; verified-result fallback when explanation formatting fails; sanitized provider diagnostics; bounded step/repair/tool counters; pre-provider material-ambiguity interrupt; Phase 6 compiler/executor bridge; deterministic result/chart and explanation-number verification; cancellation between nodes; migration `0011` with optimistic checkpoints, durable clarifications, progress counters/events, composite ownership FKs, forced RLS and narrow grants; same-run CSRF-protected clarification resume; reload-safe clarification/progress UI; graph/provider/API and Alice/Bob RLS tests | Semantic retrieval intentionally returns an empty typed context until Phase 8. Follow-up suggestion generation remains Phase 9. Provider prose may vary, but every calculation and displayed numeric highlight comes from the verified deterministic artifact. |
| 8 - RAG and memory                | Scaffolded  | Qdrant client and version-controlled knowledge-base starter documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Load/index pipeline, tenant-filtered retrieval, dataset semantic documents, summaries and typed memory lifecycle                                                                                                                                               |
| 9 - Suggestions and hardening     | Partial     | OSS license/contribution/security documents and foundational unit tests exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Suggestions, evaluation artifacts, complete security acceptance suite, accessibility review, demo data and final smoke tests                                                                                                                                   |

## Specification coverage

| Specs                                         | Coverage                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Partial; foundation rules apply, analytics/agent/credential rules await their phases                                          |
| 001 Product requirements                      | Partial; the complete MVP acceptance contract spans Phases 0-9                                                                |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                                                                |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                                                             |
| 004                                           | Implemented in Phase 3                                                                                                        |
| 005 and conversation sections of 012/013/015  | Implemented in Phase 4                                                                                                        |
| 006 and dataset sections of 012/013/015       | Phase 5 upload/profile slice implemented; queued cross-resource deletion remains planned                                      |
| 008                                           | Implemented in Phase 6                                                                                                        |
| 007                                           | Implemented in Phase 7; semantic retrieval is intentionally deferred to Specs 009-010 and Phase 8                             |
| 009-010                                       | Scaffolded for Phase 8                                                                                                        |
| 011, 017-018                                  | Partial; completed in Phase 9                                                                                                 |
| 012-013 provider and analytical sections      | Provider settings, analytical artifacts, checkpoints, clarifications and replayable Phase 7 progress events implemented       |
| 014                                           | Implemented foundation plus provider and conversation controls; later controls follow their phases                            |
| 016                                           | Identity through agent prompt/tool controls implemented; vector retrieval and cross-store deletion controls follow in Phase 8 |
| 017                                           | Phase 6 contracts, planner, compiler, golden DuckDB, API, repository and RLS coverage implemented                             |
| 019                                           | Active delivery order and definition of done                                                                                  |
| 020                                           | Active execution contract                                                                                                     |
| 021                                           | Approved Phase 8 execution contract                                                                                           |

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
- Analytical execution accepts only a strict versioned plan containing stored column IDs and allow-listed
  operations. The compiler owns all SQL, quotes identifiers, binds filter values, rejects unsupported plan
  shapes and cannot accept SQL or paths. The worker reloads the active dataset/version under forced RLS,
  reads only its server-owned object key, verifies exact bytes and SHA-256 into a randomized `0600` file,
  materializes one in-memory `dataset` relation, then disables DuckDB external access before executing the
  compiled `SELECT`. Memory, threads, scan bytes, time, result rows and result bytes are bounded.
- Analysis plans, bounded results, checksums, provenance and validated charts are stored separately from
  message text under composite tenant FKs and append-only application grants. Result reads derive ownership
  from the session, return the same `404` for absent/foreign IDs, revalidate chart fields against the stored
  result schema and never expose user IDs, object keys, raw SQL or filesystem paths. React renders values as
  escaped text and never executes model- or CSV-generated code.
- Phase 7 sends OpenAI only the current question, bounded schema/profile context, strict plan-validation
  feedback and at most the configured bounded result rows needed for explanation. It never sends a provider
  key, object key, signed URL, filesystem path, executable SQL or the full CSV. System policies and untrusted
  dataset/result content are structurally separated; model output is strict Zod data and cannot change the
  actor, active dataset, resource permissions or executable query text.
- The LangGraph checkpoint contains versioned actor/resource IDs, safe profile metadata, plan,
  clarification and bounded counters only. PostgreSQL enforces a 512 KiB state limit, optimistic revisions,
  composite run ownership, forced RLS and column grants. Clarification answers update the same checkpoint
  and run transactionally, append a user message and replayable event, and enqueue one idempotent resume.
  No durable cross-turn memory or vector retrieval is active before Phase 8.

## Verification baseline

Last verified on 2026-08-09:

| Command/runtime check   | Result                                                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm quality`          | Formatting, architecture, lint, all 12 TypeScript tasks and 167 unit/API tests passed; the sandboxed command reached the final build before Turbopack was denied a temporary local port                                                                                                         |
| `pnpm build`            | Passed outside the restricted sandbox: all package builds, worker declarations and the optimized Next.js production build                                                                                                                                                                       |
| `pnpm env:check`        | Passed; root `.env` includes the Phase 7 provider timeout, graph/tool/repair limits and bounded model-result rows                                                                                                                                                                               |
| Migration state         | `pnpm db:migrate` passed through `0011`; checkpoints and clarifications use forced RLS and least-privilege grants                                                                                                                                                                               |
| `pnpm test:integration` | Passed: 36 PostgreSQL repository/RLS tests, including Phase 7 fail-closed reads, Alice/Bob checkpoint/clarification isolation and immutable ownership fields                                                                                                                                    |
| `pnpm docker:config`    | Passed with scoped service environments, Phase 7 agent source mounts, development `NODE_ENV`, analytical/upload limits, encryption configuration and Mailpit                                                                                                                                    |
| Full Compose runtime    | Passed after the one-time MinIO reconciliation: web healthy, worker starts both queues, readiness reaches PostgreSQL, Redis, Qdrant and S3, both restored immutable CSV objects survive a MinIO stop/start, and the exact previously failed bounded lookup executes successfully through DuckDB |
| Browser-to-MinIO upload | Exact presigned `PUT` passed against MinIO with content type, checksum and intent metadata in `X-Amz-SignedHeaders`; the recovered 10,000-row CSV completed through the transactional outbox and ingestion worker and reached `ready` with 9 profiled columns                                   |
| Phase 7 graph checks    | Mocked provider golden cases pause before planning, route semantic operation-shape failures through bounded repair, resume selected measure/date columns, repair false unsupported decisions into clarification, preserve verified results when prose fails, and bound repair/cancel            |
| Provider integration    | Model list, strict-schema compatibility, Responses API parsing/error mapping, safe diagnostics and credential lifecycle are covered at mocked boundaries; automated tests make no real OpenAI request                                                                                           |
| Browser hydration       | The transient send button opts out of Firefox disabled-state restoration; an SSR regression asserts the initial `disabled` and `autocomplete=off` contract                                                                                                                                      |

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

Implement the Phase 8 confirmed-business-rule vertical slice defined by Spec 021:

1. Add strict memory and knowledge-document contracts plus PostgreSQL tables with source identity,
   confidence, dataset/version binding, content hashes, vector point IDs, status, composite ownership FKs,
   forced RLS and least-privilege grants.
2. Generate dataset/column semantic documents after profiling and embed them asynchronously with the user's
   credential, the configured embedding model and idempotent content/model hashes. Keep reviewed safety
   policies loaded directly from allow-listed `knowledge-base/` paths rather than duplicating them per user.
3. Implement one Qdrant collection with mandatory `userId`, dataset and compatible-version filters for every
   private lookup. Treat a missing tenant filter as an error, not an empty/default query, and coordinate stale
   point deletion through the outbox.
4. Let a user explicitly save a clarification as a confirmed dataset definition. Retrieve it into the existing
   empty graph context step, disclose the applied rule, and never promote a one-time answer automatically.
5. Prove the slice with business-rule plan improvement, zero-leak Alice/Bob and V1/V2 retrieval tests,
   idempotent re-indexing, prompt-injection data handling and PostgreSQL/Qdrant deletion behavior.

Phase 8 does not use vector similarity to calculate numeric answers. The Phase 6 deterministic compiler and
executor remain the only calculation path. Phase 2 Playwright verification remains deferred by product
direction; manual Phase 5 browser checks are documented in `docs/phase-5-e2e.md`.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
