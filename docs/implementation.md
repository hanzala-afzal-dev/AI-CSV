# Implementation Status

**Updated:** 2026-07-12  
**Current target:** Phase 2 - Identity and tenant boundary

This file is the single source of truth for implementation progress. Specifications in `docs/specs/`
define approved behavior; their approval does not mean that behavior has shipped.

## Status rules

- **Implemented:** the phase definition of done and applicable global checks have passed.
- **Partial:** production code exists, but at least one required behavior or verification is missing.
- **Scaffolded:** dependencies or compiling placeholders exist without the required product behavior.
- **Planned:** no meaningful implementation exists.
- A phase is never marked implemented solely because tables, interfaces, or directories exist.

## Phase ledger

| Phase                             | Status      | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                                | Remaining work                                                                                                                                               |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 - Repository reconciliation     | Implemented | Next.js App Router retained; pnpm/Turbo modular monolith, ADRs, contracts index, and executable architecture check exist                                                                                                                                                                                                                                                                            | Keep architecture documentation synchronized                                                                                                                 |
| 1 - Platform foundation           | Implemented | Strict TypeScript, local quality gate, Compose services, web/worker Dockerfiles, PostgreSQL/Drizzle, Redis/BullMQ, Qdrant, LocalStack S3, typed env, structured logging, health/readiness                                                                                                                                                                                                           | Hosted CI remains explicitly out of scope; rerun runtime smoke tests after infrastructure changes                                                            |
| 2 - Identity and tenant boundary  | Partial     | Identity domain/application boundary; normalized email; Argon2id; registration/login/logout/current-user APIs; hashed revocable sessions and single-use tokens; secure cookies; session-bound CSRF rotation; Redis IP/identifier/account limits; verification/reset and account/session management; RLS/least-privilege migrations; component-driven auth/settings UI; unit and API isolation tests | Apply migration `0005`, pass the expanded PostgreSQL integration suite and production build, then complete runtime/UI smoke verification                     |
| 3 - Secure OpenAI settings        | Planned     | None                                                                                                                                                                                                                                                                                                                                                                                                | Encrypted credentials, validation, safe metadata, model catalog/preferences, audit and security controls                                                     |
| 4 - Persistent conversation shell | Planned     | Legacy foundation tables do not satisfy the conversation contract                                                                                                                                                                                                                                                                                                                                   | Conversation/message/run/event persistence, CRUD UI, settings navigation, SSE and reconnect                                                                  |
| 5 - CSV upload and profiling      | Partial     | Dataset aggregate, versioned presigned upload, S3 metadata verification, idempotent completion, transactional outbox, and versioned BullMQ payload                                                                                                                                                                                                                                                  | Worker ownership reload, CSV validation, DuckDB profile, optional Parquet, lifecycle completion, profile APIs, progress/error UI and storage isolation tests |
| 6 - Deterministic analytics       | Planned     | DuckDB adapter dependency only                                                                                                                                                                                                                                                                                                                                                                      | Analysis plan schema/compiler, bounded read-only execution, provenance, result and chart artifacts                                                           |
| 7 - Agent orchestration           | Scaffolded  | LangGraph package, state and compiling placeholder graph                                                                                                                                                                                                                                                                                                                                            | Provider gateway, real graph nodes/tools, checkpoints, clarification/resume, verification, cancellation and streaming                                        |
| 8 - RAG and memory                | Scaffolded  | Qdrant client and version-controlled knowledge-base starter documents                                                                                                                                                                                                                                                                                                                               | Load/index pipeline, tenant-filtered retrieval, dataset semantic documents, summaries and typed memory lifecycle                                             |
| 9 - Suggestions and hardening     | Partial     | OSS license/contribution/security documents and foundational unit tests exist                                                                                                                                                                                                                                                                                                                       | Suggestions, evaluation artifacts, complete security acceptance suite, accessibility review, demo data and final smoke tests                                 |

## Specification coverage

| Specs                                         | Coverage                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 000 Engineering constitution                  | Partial; foundation rules apply, analytics/agent/credential rules await their phases      |
| 001 Product requirements                      | Partial; the complete MVP acceptance contract spans Phases 0-9                            |
| 002 Architecture and boundaries               | Implemented baseline and enforced by `pnpm architecture:check`                            |
| 003, 012 identity sections, 016 auth controls | Implemented in code; Phase 2 verification remains                                         |
| 004                                           | Planned in Phase 3                                                                        |
| 005 and conversation sections of 012/013/015  | Planned in Phase 4                                                                        |
| 006 and dataset sections of 012/013/015       | Partial in Phase 5                                                                        |
| 008                                           | Planned in Phase 6                                                                        |
| 007                                           | Scaffolded for Phase 7                                                                    |
| 009-010                                       | Scaffolded for Phase 8                                                                    |
| 011, 017-018                                  | Partial; completed in Phase 9                                                             |
| 014                                           | Implemented foundation; capability-specific operational controls remain with their phases |
| 019                                           | Active delivery order and definition of done                                              |
| 020                                           | Active execution contract                                                                 |

## Current security posture

- Browser authentication uses Argon2id passwords and persisted opaque sessions. PostgreSQL stores only
  keyed token hashes. Cookies are HTTP-only, secure in production, SameSite strict, and bounded by idle
  and absolute expiry.
- Cookie-authenticated mutations require JSON, trusted Origin/Referer, and a rotating session-bound CSRF
  token. Authentication and recovery limits use hashed IP, identifier, and authenticated-account buckets
  and fail closed when Redis is unavailable.
- Identity tables use RLS, narrow security-definer functions for pre-authentication work, and column-level
  application-role grants. Existing bearer keys remain CLI/server credentials only.
- Analytical SQL and agent tool execution are not implemented. Their allow-listing, read-only execution,
  resource limits, and prompt-injection controls remain mandatory in Phases 6-7.

## Verification baseline

Last verified on 2026-07-12:

| Command                 | Result                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| `pnpm lint`             | Passed after Phase 2 implementation                                            |
| `pnpm typecheck`        | Passed after Phase 2 implementation                                            |
| `pnpm test`             | Passed: 49 unit/API tests across the workspace                                 |
| `pnpm db:migrate`       | Migration `0004` passed; least-privilege migration `0005` still requires apply |
| `pnpm test:integration` | Expanded identity/RLS suite is committed but still requires a post-`0005` run  |
| `pnpm build`            | Native module composition issue fixed; final build is pending outside sandbox  |
| Compose config          | Tracked Compose example validated, including Mailpit                           |

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

Close Phase 2 verification in this order:

1. Apply migration `0005_identity_least_privilege`.
2. Run the expanded identity and tenant RLS integration suite.
3. Run `pnpm quality` where the Next.js/Turbopack build may bind its internal process port.
4. Smoke-test registration, Mailpit verification, login, CSRF mutations, password reset, and session
   revocation in the running application.
5. Verify the authentication and settings screens at mobile and desktop sizes.

After these checks pass, mark Phase 2 implemented and start Phase 3: encrypted OpenAI credentials and
model preferences.

Retain opaque API keys only as documented CLI/server credentials; they must not become browser storage.

## Update protocol

When a phase changes, update this file in the same change set with:

1. status and concrete evidence;
2. migrations and externally visible behavior;
3. validation commands actually run;
4. known limitations;
5. the next smallest complete vertical slice.
