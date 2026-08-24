# Implementation Status

**Updated:** 2026-08-23

**Current target:** MVP release operations and deployment hardening

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Remaining work                                                                                                                                                                                                                                                |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep architecture documentation synchronized                                                                                                                                                                                                                  |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, stable bind-mounted development containers with workspace watch builds, separate production Docker targets, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, persistent MinIO S3, typed env with template-drift validation, Docker runbook, structured logging, health/readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Hosted CI remains explicitly out of scope; rebuild only after dependency or container-definition changes and rerun runtime smoke tests after infrastructure changes                                                                                           |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email with database-enforced normalized uniqueness; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI with async-safe form handling; unit/API/RLS isolation tests; registration, Mailpit delivery, verification, and production login smoke; production Docker build and runtime readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Browser-level authentication and settings smoke verification is deferred; no known feature or API gap blocks Phase 3                                                                                                                                          |
| 3 - Secure OpenAI settings        | Implemented | Provider domain/application ports and strict contracts; opaque `SecretValue`; AES-256-GCM with random nonces, AAD and versioned keys; validate-before-replace OpenAI credentials; safe model/reasoning catalog; CSRF/origin and fail-closed Redis limits; redacted errors/logs; migration `0007` with RLS, column grants, actor-scoped secret reads and append-only audits; component-driven settings UI with loading, invalid, fallback, empty and delete states; unit/API/repository/RLS tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Production deployments should replace the local master-key baseline with managed KMS envelope encryption and an operational re-encryption procedure; no known Phase 3 feature gap                                                                             |
| 4 - Persistent conversation shell | Implemented | Conversation domain/application boundary and strict contracts; UUIDv7 entity IDs; migration `0008` with conversation/message/run/event tables, composite ownership FKs, sequence and active-run constraints, RLS and least-privilege grants; cursor CRUD APIs; idempotent submission; transactional outbox; duplicate-safe BullMQ worker; deterministic assistant; durable paged SSE replay/cancel; Redis submission/stream/concurrency limits; component-driven responsive chat UI with search, archive, rename, delete, provider gate, loading/empty/error/stream states; unit/API/RLS and live Compose smoke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The assistant is deliberately deterministic in this phase; CSV-backed responses begin in Phase 5 and real OpenAI/LangGraph execution begins in Phase 7                                                                                                        |
| 5 - CSV upload and profiling      | Implemented | Strict dataset/profile contracts with safe browser projections; versioned presigned S3 upload with provider-strict signed content type, checksum and intent metadata headers; checksum/metadata verification; idempotent completion and transactional outbox; migration `0009` with profile/column storage, active conversation version, composite ownership FKs, claims, forced RLS and narrow grants; bounded BullMQ retry and database claims; streaming UTF-8/binary/shape validation and resource-limited DuckDB profiling; durable list/detail/profile APIs; CSRF/origin and user/hashed-IP upload limits; reusable upload/progress/failure/profile UI with persistent direct-upload errors, timeout handling and retry; synthetic fixtures; unit/API/repository/RLS and live Compose smoke                                                                                                                                                                                                                                                                                                                                                                                  | Parquet normalization remains optional. Cross-resource dataset deletion is deferred to the queued privacy-deletion workflow, when vector/memory derivatives exist; it is not part of the approved Phase 5 upload slice                                        |
| 6 - Deterministic analytics       | Implemented | Versioned strict `AnalysisPlan`, result, provenance and `ChartSpec` contracts; deterministic common-question planner; allow-listed compiler with stored column IDs, quoted identifiers and bound filters; controlled immutable S3 source verification with typed missing/unavailable source failures; memory/thread/time/scan/row/byte-bounded DuckDB execution with external access disabled before compiled SQL; migration `0010` with immutable plan/result/chart artifacts, composite ownership FKs, bounded JSON, forced RLS and narrow grants; atomic message/artifact persistence; ownership-safe result API; trusted accessible table/bar/line/pie/scatter renderers with loading, empty, truncation, provenance and retry states; golden numeric, compiler-injection, chart-validation, API and Alice/Bob RLS tests                                                                                                                                                                                                                                                                                                                                                       | No Phase 6 blocker. The deterministic phrase planner intentionally covers common unambiguous requests; nuanced intent, natural-language filter extraction, clarification and explanation generation belong to the bounded Phase 7 graph                       |
| 7 - Agent orchestration           | Implemented | One explicit versioned LangGraph workflow; actor-injected state; OpenAI-compatible required-nullable structured planning/explanation through the user's encrypted credential and persisted model snapshot; provider-wire structural validation separated from semantic plan validation so operation-shape errors use bounded schema-grounded repair; repair rules supplied as trusted planning metadata; repair of false unsupported decisions into clarification; role-aware binding of answered clarification columns; capability prose constrained by trusted contract metadata; verified-result fallback when explanation formatting fails; sanitized provider diagnostics; bounded step/repair/tool counters; pre-provider material-ambiguity interrupt; Phase 6 compiler/executor bridge; deterministic result/chart and explanation-number verification; cancellation between nodes; migration `0011` with optimistic checkpoints, durable clarifications, progress counters/events, composite ownership FKs, forced RLS and narrow grants; same-run CSRF-protected clarification resume; reload-safe clarification/progress UI; graph/provider/API and Alice/Bob RLS tests | Phase 8 now supplies bounded semantic context. Follow-up suggestion generation remains Phase 9. Provider prose may vary, but every calculation and displayed numeric highlight comes from the verified deterministic artifact.                                |
| 8 - RAG and memory                | Implemented | Strict context, definition and knowledge-job contracts; migrations `0012`-`0013` with authoritative memory/document lifecycle, stable vector IDs, revision heads, composite ownership FKs, forced RLS, narrow grants and existing-profile backfill; bounded same-conversation recent-turn context with finalized-role filtering, deterministic 12-message/24,000-character limits, checkpoint persistence and typed history recall; history-only requests bypass embedding/vector retrieval; bounded semantic documents without raw examples; encrypted per-user OpenAI embeddings; idempotent indexing and credential-triggered retry; Qdrant fail-before-request tenant/dataset/version filters and filtered deletion; revision-keyed Redis cache and singleflight; explicit definition opt-in; PostgreSQL fallback; graph plan constraint and disclosure; fixed trusted policy allowlist; transactional deletion outbox; layered security tests and live history/RAG verification                                                                                                                                                                                               | Conversation compaction/summaries, preferences, free-text chunks, validated insights, reranking and memory-management UI remain later extensions. Phase 9 now supplies authenticated dataset/account deletion across PostgreSQL, S3, Redis/BullMQ and Qdrant. |
| 9 - Suggestions and hardening     | Implemented | Strict versioned initial/follow-up suggestion contracts with stable IDs and stored column references; deterministic schema/result-compatible generation; actor-scoped repository and API; accessible reusable prompt actions through the protected composer; migrations `0014`-`0016` with reauthenticated, idempotent dataset/account deletion, trusted clarification-label persistence and historical UUID-label backfill; stable single-stream chat state and non-destructive background refreshes; cross-store deletion across PostgreSQL, S3, Redis/BullMQ and Qdrant with hashed audit retention; 50-case synthetic planner/numeric/chart/memory/isolation corpus and reproducible JSON/Markdown reports; deterministic SQL tie-breakers; production security headers; secret/dependency policy gates; clean production advisory audit; accessibility review and release runbook; API/unit/component/Alice-Bob RLS/deletion retry tests                                                                                                                                                                                                                                      | Verified insights remain optional. Browser automation remains deferred by product direction. Privacy deletion safely rejects manifests above 1,000 object keys; production deployments also need managed KMS and operational backup/restore validation.       |

## Specification coverage

| Specs                                         | Coverage                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Implemented MVP baseline; documented post-MVP operational and product extensions remain                                                                   |
| 001 Product requirements                      | Implemented MVP phases 0-9; optional verified insights and later memory extensions remain                                                                 |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                                                                                            |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                                                                                         |
| 004                                           | Implemented in Phase 3                                                                                                                                    |
| 005 and conversation sections of 012/013/015  | Implemented in Phase 4                                                                                                                                    |
| 006 and dataset sections of 012/013/015       | Upload/profile plus Phase 9 cross-store dataset deletion implemented                                                                                      |
| 008                                           | Implemented in Phase 6                                                                                                                                    |
| 007                                           | Implemented in Phase 7 and connected to bounded semantic retrieval in Phase 8                                                                             |
| 009-010                                       | Recent same-conversation window and Spec 021 confirmed-definition RAG slice implemented; compaction, preferences and extended document types remain later |
| 011, 017-018                                  | Implemented in Phase 9 with deterministic suggestions, evaluation/release evidence and honest OSS docs                                                    |
| 012-013 provider and analytical sections      | Provider settings, analytical artifacts, checkpoints, clarifications and replayable Phase 7 progress events implemented                                   |
| 014                                           | Implemented foundation plus provider and conversation controls; later controls follow their phases                                                        |
| 016                                           | Identity, retrieval isolation, prompt-injection controls and retryable dataset/account privacy deletion implemented                                       |
| 017                                           | Unit/integration/RLS coverage plus a reproducible 50-case deterministic Phase 9 evaluator implemented                                                     |
| 019                                           | Active delivery order and definition of done                                                                                                              |
| 020                                           | Active execution contract                                                                                                                                 |
| 021                                           | Implemented Phase 8 execution contract                                                                                                                    |
| 022                                           | Implemented Phase 9 execution contract                                                                                                                    |

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
- Phase 7 sends OpenAI the current question, at most 12 finalized same-conversation user/assistant turns
  within a 24,000-character budget, bounded schema/profile context, strict plan-validation feedback and at
  most the configured bounded result rows needed for explanation. It never sends a provider
  key, object key, signed URL, filesystem path, executable SQL or the full CSV. System policies and untrusted
  conversation/dataset/result content are structurally separated; model output is strict Zod data and
  cannot change the actor, active dataset, resource permissions or executable query text.
- The LangGraph checkpoint contains versioned actor/resource IDs, safe profile metadata, the bounded
  same-conversation turn window, plan, clarification and counters. PostgreSQL enforces a 512 KiB state limit, optimistic revisions,
  composite run ownership, forced RLS and column grants. Clarification answers update the same checkpoint
  and run transactionally, append a user message and replayable event, and enqueue one idempotent resume.
- Durable definitions are created only through explicit browser opt-in and remain bound to the actor,
  dataset and exact version. PostgreSQL is authoritative; Qdrant points are derived and carry mandatory
  tenant/dataset/version payloads. The adapter rejects incomplete filters before network I/O, while RLS and
  composite FKs prevent cross-owner hydration even if a vector record ID is guessed.
- Embeddings use the authenticated user's encrypted credential, a dedicated embedding model and bounded
  inputs. Dataset semantic documents omit raw example values, object keys, signed URLs and unrestricted rows.
  Retrieval is bounded by top-K, score and character budget, cached by HMAC query key plus authoritative
  revision, and degrades to exact confirmed definitions when Redis, embeddings or Qdrant is unavailable.
- Reviewed analytical, tenant, prompt-injection and chart policies load from a fixed path allowlist as
  trusted system context. Retrieved text stays in a separate `UNTRUSTED_RETRIEVED_CONTEXT` structure and can
  neither change ownership/tool policy nor calculate values. DuckDB remains the only numeric execution path.
- Conversation deletion commits a typed vector-deletion outbox event before PostgreSQL cascade. Knowledge
  jobs are schema-validated, retryable and idempotent; deletion always includes the trusted user filter and
  indexing uses stable point identities plus content/model hashes.

- Initial and follow-up suggestions are typed derived questions, not factual claims. They are generated
  from the server-authorized active version and latest verified result and cannot accept ownership IDs
  or column IDs from the browser or model.
- Clarification option values remain internal checkpoint data. Visible questions, choices and selected
  answers are normalized against trusted dataset column names, and background run refreshes preserve
  the populated timeline instead of replacing it with loading UI.
- Dataset and account deletion requires current-password reauthentication, session-bound CSRF, trusted
  Origin/Referer and fail-closed rate limits. A retryable bounded worker purges S3 objects, Redis memory
  and removable jobs, Qdrant vectors and PostgreSQL state before retaining only hashed audit metadata.
- Production headers include CSP, HSTS, frame/MIME/referrer/capability and same-origin controls. The
  repository scans secrets, enforces dependency-age/patched-override policy and currently has no known
  production dependency advisories.

## Verification baseline

Last verified on 2026-08-23:

| Command/runtime check   | Result                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm quality`          | Passed: formatting, architecture, lint, all TypeScript tasks, 208 unit/API/component tests and every optimized production build                                               |
| `pnpm test:integration` | Passed: 48 PostgreSQL repository/RLS cases including Alice/Bob suggestion isolation and dataset/account deletion scheduling, claims, tombstones, cascades and audit retention |
| `pnpm eval:phase9`      | Passed: 50 deterministic planner, exact/approximate DuckDB numeric, checksum, chart, clarification, memory reuse/non-reuse, prompt-injection and zero-leak retrieval cases    |
| `pnpm migration:check`  | Passed all 17 committed migrations against a generated empty database, then dropped only that temporary database                                                              |
| `pnpm security:check`   | Passed high-confidence tracked/untracked secret scanning plus lockfile, release-age, weekly review and patched-override policy                                                |
| `pnpm security:audit`   | Passed with no known production vulnerabilities after the reviewed Next.js, Sharp, PostCSS, Nanoid and Undici updates                                                         |
| Migration state         | Local PostgreSQL migrated through `0016`; privacy deletion controls and clarification-label backfills are applied                                                             |
| Provider automation     | Model and embedding boundaries remain mocked/recorded; automated gates make no real OpenAI request                                                                            |

The release-equivalent command is:

```bash
pnpm release:check
```

It installs from the frozen lockfile and runs the applicable quality, integration, empty-migration,
evaluation, secret and dependency gates. Docker configuration/runtime and the optional real-provider
smoke remain explicit release-operator checks in `docs/phase-9-release.md`.

## Next implementation slice

The planned phases are implemented. The next smallest release-focused slice is:

1. Move the credential master key to managed KMS envelope encryption and document restore/rotation drills.
2. Add production deployment manifests, metrics/alerts, queue dead-letter operations and tested PostgreSQL,
   object-storage and Qdrant backup/restore procedures.
3. Run the documented Firefox/Chromium keyboard, zoom and responsive matrix plus the optional real-provider
   smoke before a tagged release.
4. Write a new approved specification before adding conversation compaction, preferences, broader document
   retrieval, reranking, memory-management UI or persisted verified insights.

Verified insights remain optional and may ship only when backed by persisted deterministic results and
provenance. Browser automation remains deferred by product direction; manual checks are documented in
`docs/phase-9-release.md` and `docs/reviews/phase-9-accessibility.md`.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
