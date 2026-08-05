# Implementation Status

**Updated:** 2026-08-05

**Current target:** Phase 7 - stateful LangGraph orchestration

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remaining work                                                                                                                                                                                                                          |
| --------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Keep architecture documentation synchronized                                                                                                                                                                                            |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, stable bind-mounted development containers with workspace watch builds, separate production Docker targets, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, LocalStack S3, typed env with template-drift validation, Docker runbook, structured logging, health/readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Hosted CI remains explicitly out of scope; rebuild only after dependency or container-definition changes and rerun runtime smoke tests after infrastructure changes                                                                     |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email with database-enforced normalized uniqueness; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI with async-safe form handling; unit/API/RLS isolation tests; registration, Mailpit delivery, verification, and production login smoke; production Docker build and runtime readiness                                                                                                                                                                       | Browser-level authentication and settings smoke verification is deferred; no known feature or API gap blocks Phase 3                                                                                                                    |
| 3 - Secure OpenAI settings        | Implemented | Provider domain/application ports and strict contracts; opaque `SecretValue`; AES-256-GCM with random nonces, AAD and versioned keys; validate-before-replace OpenAI credentials; safe model/reasoning catalog; CSRF/origin and fail-closed Redis limits; redacted errors/logs; migration `0007` with RLS, column grants, actor-scoped secret reads and append-only audits; component-driven settings UI with loading, invalid, fallback, empty and delete states; unit/API/repository/RLS tests                                                                                                                                                                                                                                                                              | Production deployments should replace the local master-key baseline with managed KMS envelope encryption and an operational re-encryption procedure; no known Phase 3 feature gap                                                       |
| 4 - Persistent conversation shell | Implemented | Conversation domain/application boundary and strict contracts; UUIDv7 entity IDs; migration `0008` with conversation/message/run/event tables, composite ownership FKs, sequence and active-run constraints, RLS and least-privilege grants; cursor CRUD APIs; idempotent submission; transactional outbox; duplicate-safe BullMQ worker; deterministic assistant; durable paged SSE replay/cancel; Redis submission/stream/concurrency limits; component-driven responsive chat UI with search, archive, rename, delete, provider gate, loading/empty/error/stream states; unit/API/RLS and live Compose smoke                                                                                                                                                               | The assistant is deliberately deterministic in this phase; CSV-backed responses begin in Phase 5 and real OpenAI/LangGraph execution begins in Phase 7                                                                                  |
| 5 - CSV upload and profiling      | Implemented | Strict dataset/profile contracts with safe browser projections; versioned presigned S3 upload and checksum/metadata verification; idempotent completion and transactional outbox; migration `0009` with profile/column storage, active conversation version, composite ownership FKs, claims, forced RLS and narrow grants; bounded BullMQ retry and database claims; streaming UTF-8/binary/shape validation and resource-limited DuckDB profiling; durable list/detail/profile APIs; CSRF/origin and user/hashed-IP upload limits; reusable upload/progress/failure/profile UI; synthetic fixtures; unit/API/repository/RLS and live Compose smoke                                                                                                                          | Parquet normalization remains optional. Cross-resource dataset deletion is deferred to the queued privacy-deletion workflow, when vector/memory derivatives exist; it is not part of the approved Phase 5 upload slice                  |
| 6 - Deterministic analytics       | Implemented | Versioned strict `AnalysisPlan`, result, provenance and `ChartSpec` contracts; deterministic common-question planner; allow-listed compiler with stored column IDs, quoted identifiers and bound filters; controlled immutable S3 source verification; memory/thread/time/scan/row/byte-bounded DuckDB execution with external access disabled before compiled SQL; migration `0010` with immutable plan/result/chart artifacts, composite ownership FKs, bounded JSON, forced RLS and narrow grants; atomic message/artifact persistence; ownership-safe result API; trusted accessible table/bar/line/pie/scatter renderers with loading, empty, truncation, provenance and retry states; golden numeric, compiler-injection, chart-validation, API and Alice/Bob RLS tests | No Phase 6 blocker. The deterministic phrase planner intentionally covers common unambiguous requests; nuanced intent, natural-language filter extraction, clarification and explanation generation belong to the bounded Phase 7 graph |
| 7 - Agent orchestration           | Scaffolded  | LangGraph package, state and compiling placeholder graph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Provider gateway, real graph nodes/tools, checkpoints, clarification/resume, verification, cancellation and streaming                                                                                                                   |
| 8 - RAG and memory                | Scaffolded  | Qdrant client and version-controlled knowledge-base starter documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Load/index pipeline, tenant-filtered retrieval, dataset semantic documents, summaries and typed memory lifecycle                                                                                                                        |
| 9 - Suggestions and hardening     | Partial     | OSS license/contribution/security documents and foundational unit tests exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Suggestions, evaluation artifacts, complete security acceptance suite, accessibility review, demo data and final smoke tests                                                                                                            |

## Specification coverage

| Specs                                         | Coverage                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Partial; foundation rules apply, analytics/agent/credential rules await their phases                                                     |
| 001 Product requirements                      | Partial; the complete MVP acceptance contract spans Phases 0-9                                                                           |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                                                                           |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                                                                        |
| 004                                           | Implemented in Phase 3                                                                                                                   |
| 005 and conversation sections of 012/013/015  | Implemented in Phase 4                                                                                                                   |
| 006 and dataset sections of 012/013/015       | Phase 5 upload/profile slice implemented; queued cross-resource deletion remains planned                                                 |
| 008                                           | Implemented in Phase 6                                                                                                                   |
| 007                                           | Scaffolded for Phase 7                                                                                                                   |
| 009-010                                       | Scaffolded for Phase 8                                                                                                                   |
| 011, 017-018                                  | Partial; completed in Phase 9                                                                                                            |
| 012-013 provider and analytical sections      | Provider settings implemented in Phase 3; Phase 6 analytical artifacts and result read implemented                                       |
| 014                                           | Implemented foundation plus provider and conversation controls; later controls follow their phases                                       |
| 016                                           | Identity, provider, conversation, upload and deterministic analytical controls implemented; agent prompt/tool controls follow in Phase 7 |
| 017                                           | Phase 6 contracts, planner, compiler, golden DuckDB, API, repository and RLS coverage implemented                                        |
| 019                                           | Active delivery order and definition of done                                                                                             |
| 020                                           | Active execution contract                                                                                                                |

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
- Phase 6 does not call an LLM, send CSV rows to OpenAI, or interpret CSV cells as instructions. Stateful
  provider planning, structured prompt boundaries, clarification and bounded tools begin in Phase 7; RAG
  and memory remain Phase 8.

## Verification baseline

Last verified on 2026-08-05:

| Command/runtime check   | Result                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm quality`          | Passed: formatting, architecture, lint, typecheck, 146 unit/API tests and the production workspace build                                                   |
| `pnpm env:check`        | Passed; root `.env` contains every key documented by `.env.example`, including all Phase 6 analytical limits                                               |
| Migration state         | `pnpm db:migrate` passed through `0010`; generated Drizzle schema and migration metadata are committed                                                     |
| `pnpm test:integration` | Passed: 35 PostgreSQL repository/RLS tests, including Phase 6 fail-closed reads, Alice/Bob isolation, composite ownership denial and artifact immutability |
| `pnpm docker:config`    | Passed with scoped service environments, analytical/upload limits, LocalStack browser CORS, encryption configuration and Mailpit                           |
| Full Compose runtime    | Web, worker and infrastructure services remain healthy without image recreation; source watch builds load Phase 6 into the existing development containers |
| Phase 6 runtime smoke   | Disposable register/verify/login, signed CSV upload, BullMQ profile, live analysis, persisted API reload and exact golden grouped totals/chart passed      |
| Provider integration    | OpenAI model-list behavior remains covered at a mocked HTTP boundary; Phase 6 never decrypts or calls the saved provider key                               |

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

Implement Phase 7 as one ambiguity-to-resume analytical graph slice:

1. Replace the placeholder graph with one explicit versioned state and bounded nodes for authorization,
   profile loading, intent classification, structured plan creation, deterministic validation/execution,
   result verification, chart selection, explanation and persistence. Keep `userId`, resource ownership and
   tool permissions trusted application inputs that model output cannot replace.
2. Add a provider gateway that loads only the actor's encrypted OpenAI credential and validated model/
   reasoning preference, decrypts immediately before the request, requests strict structured output, maps
   provider timeout/rate-limit/schema failures to safe run errors, and never sends a full CSV or arbitrary
   object paths. Continue using the Phase 6 compiler/executor for every calculation.
3. Add PostgreSQL-backed LangGraph checkpoints tied to user/conversation/run ownership, forced RLS and
   deletion rules. Persist step/repair/tool counters and enforce configurable maximums, duplicate-safe node
   effects and cancellation checks between nodes.
4. Implement one material-ambiguity interrupt: persist a clarification question without executing analysis,
   expose the typed clarification/resume mutation, and resume the same checkpoint/run after the authenticated
   answer. SSE must surface versioned progress/clarification events and remain replayable after reload.
5. Prove the slice with a mocked provider and the `gross_revenue` versus `net_revenue` golden case: interrupt,
   no premature query, sign-out/reload, resume, correct deterministic result/chart, bounded repair failure,
   cancellation and Alice/Bob checkpoint/tool denial.

Phase 7 introduces LLM planning and explanation but not RAG, embeddings or durable memory. The semantic
retrieval node remains an empty typed port until Phase 8. Phase 2 Playwright verification remains deferred
by product direction; manual Phase 5 browser checks are documented in `docs/phase-5-e2e.md`.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
