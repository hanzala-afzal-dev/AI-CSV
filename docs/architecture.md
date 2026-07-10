# Architecture

## Summary

Agentic CSV Analyst is a modular monolith with separate web and worker processes.
Business rules live in package boundaries rather than route handlers.

```mermaid
flowchart LR
  Web[Next.js React web + Tailwind] --> App[Application CQRS]
  Worker[BullMQ worker] --> App
  App --> Domain[Domain]
  Web --> Infra[Infrastructure]
  Worker --> Infra
  Infra --> Postgres[(PostgreSQL)]
  Infra --> Redis[(Redis)]
  Infra --> S3[(LocalStack S3)]
  Infra --> Qdrant[(Qdrant)]
  Worker --> DuckDB[DuckDB in process]
  App --> Contracts[Zod contracts]
  Agent[LangGraph agent] --> Contracts
```

## Boundaries

- Domain contains entities, value objects, domain events, and domain errors.
- Application contains CQRS abstractions, handlers, and ports.
- Infrastructure implements ports and owns external clients.
- Web and worker compose dependencies for delivery.
- Contracts are framework-neutral Zod schemas.
- Agent contains LangGraph state and graph composition only.

## Frontend Layer

`apps/web` is a React frontend delivered through Next.js App Router. It uses Server
Components by default, keeps route handlers thin, and uses Tailwind CSS for application
styling without introducing a component framework.

## Liveness and Readiness

`GET /api/health` checks only whether the web process is alive.

`GET /api/ready` checks PostgreSQL, Redis, Qdrant, and S3/LocalStack. It returns a
structured body with dependency names and statuses. It must not include credentials,
signed URLs, raw connection strings, API keys, or passwords.

## Web and Worker Processes

Web requests should stay short. Ingestion, profiling, embedding, and outbox publishing
belong in queues. The worker validates every job payload before doing work and shuts
down cleanly on `SIGTERM` and `SIGINT`.

## Identity and Request Security

Phase 1 authenticates API clients with opaque bearer keys. PostgreSQL stores only an HMAC
of each key and resolves it to an owner ID. Every dataset and upload query includes that
owner ID; knowing a dataset UUID is insufficient for access. Bearer headers are not ambient
browser credentials, and mutation routes additionally reject cross-site fetch metadata,
untrusted origins, and non-JSON content types. This protects the current API from CSRF while
leaving interactive OAuth/session authentication as an explicit later decision.

Redis applies a global pre-authentication ceiling, a credential-bucket limit, and an owner-scoped
limit. The global ceiling bounds invalid-key rotation while the credential limit contains one key.
AI routes use the separately configured stricter policy. Protection fails closed when Redis cannot
initialize.

Zod validates external shapes and Drizzle parameterizes relational queries. User input is
never concatenated into SQL. Future analytical SQL has a separate read-only, allow-listed
contract defined by the profiling specification.

## Upload Transaction

Upload initiation creates an expiring intent containing the expected S3 key, byte size,
media type, and checksum. Completion verifies the stored object before a PostgreSQL
transaction locks owner-scoped records. Dataset state, domain events, upload completion,
idempotency response, and an ingestion outbox event commit together. The worker publishes
that outbox event to BullMQ with a deterministic job ID, so a crash between enqueue and
outbox acknowledgement does not create duplicate work.

## DuckDB Placement

DuckDB is embedded in the worker because it is an in-process analytical engine, not a
network database service. The worker can create isolated temporary databases close to
the CSV processing flow and enforce timeout and result-size controls before returning
results.

## Qdrant and PostgreSQL

PostgreSQL may run with pgvector capability for future optional use, but Qdrant is the
primary vector store. Qdrant keeps retrieval operations, payload filters, and vector
collection lifecycle independent from relational persistence.

## Observability

Pino produces structured logs with service, correlation, queue, job, dataset, and owner
fields. Secret-like fields are redacted. CSV contents, API keys, authorization headers,
passwords, and signed URLs must not be logged.
