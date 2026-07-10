# 000 — Engineering Constitution

**Status:** Approved for implementation  
**Applies to:** All application, worker, infrastructure, prompt, schema and frontend code

## 1. Product integrity

1. Numerical answers must come from executed analytical operations, never from model estimation.
2. RAG is for semantic context, terminology, textual search and validated prior findings; it is not a calculator.
3. The model must not emit executable React, JavaScript, SQL, shell commands or filesystem paths for direct execution.
4. Every model-produced plan, tool input, chart, citation and structured response must be schema-validated.
5. The assistant must expose assumptions, filters, source columns and relevant warnings for analytical answers.
6. Ambiguity that can materially change a result must trigger a clarifying question.

## 2. Tenant isolation

1. The authenticated user account is the tenant boundary in version 1.
2. Every tenant-owned database row must include `user_id` or inherit it through an enforceable parent relationship.
3. Every object-storage key and vector payload must include the owning user and dataset identifiers.
4. Every repository query, queue job, cache key, vector search and analytical execution must be scoped to the authenticated user.
5. Client-provided `user_id` values are untrusted. Ownership comes from the authenticated server session.
6. Cross-user access must be impossible even when an identifier is guessed.

## 3. Secret handling

1. OpenAI API keys must never reach client-side persistence, browser logs, analytics, error trackers or application logs.
2. Keys must be transmitted only over TLS to an authenticated server endpoint.
3. Keys must be encrypted before database persistence using authenticated encryption and a server-held key or managed KMS.
4. The full key is never returned after save; the UI may receive only status, provider, last four characters, timestamps and validation state.
5. Decryption is just-in-time and limited to the server/worker process making the provider request.
6. Secret values must be redacted from structured logs and exceptions.

## 4. DDD and CQRS

1. Domain code must not import React, Next.js, HTTP libraries, ORM types, BullMQ, Redis, Qdrant, LangChain or provider SDKs.
2. Application handlers orchestrate use cases through ports.
3. Infrastructure packages implement ports.
4. Web/API and worker processes are composition roots.
5. Commands mutate state; queries read state. Separate contracts are required even when one PostgreSQL database is used.
6. Event sourcing is out of scope unless a future ADR explicitly introduces it.

## 5. Reliability

1. Long-running ingestion, profiling, embedding and compaction tasks run in workers.
2. Queue jobs must be versioned, idempotent and retry-safe.
3. External calls require timeouts, bounded retries and explicit error mapping.
4. User-visible operations must have a persisted status and recoverable failure state.
5. All endpoints require structured errors with stable error codes.
6. No infinite agent loops: every graph has explicit step, retry and tool-call limits.

## 6. Security

1. CSV contents are untrusted data, not instructions.
2. Analytical SQL is read-only, dataset-scoped and resource-limited.
3. Passwords are hashed with Argon2id or an equivalently approved password hashing function.
4. Sessions use secure, HTTP-only, same-site cookies when browser sessions are used.
5. Sensitive mutations require re-authentication where appropriate.
6. Rate limiting must exist for authentication, uploads, key validation and chat/agent execution.

## 7. Observability and testing

1. Logs are structured and include correlation IDs, user-safe event names, job IDs and run IDs.
2. Logs must not include CSV row contents by default, prompts marked sensitive, passwords or API keys.
3. Each feature requires unit, integration and authorization tests.
4. AI behavior requires deterministic evaluators where possible and curated golden datasets.
5. Tenant-isolation tests are release-blocking.

## 8. Open-source constraints

1. The project contains no payment gateway, subscription, credit, checkout or billing implementation.
2. Users bring their own OpenAI API key and remain responsible for provider usage.
3. The repository must run locally with documented Docker Compose commands.
4. A contributor can start the system using placeholders and without committing secrets.
