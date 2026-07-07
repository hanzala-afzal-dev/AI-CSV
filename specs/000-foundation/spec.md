# Foundation Specification

## Problem Statement

Create a production-minded foundation for an Agentic CSV Analyst. The system will later
allow users to upload CSV files, inspect structure, ask natural-language questions, and
receive verified calculations and chart specifications.

This phase builds the repository, package boundaries, local infrastructure, and
operational contracts. It intentionally avoids the full CSV product.

## Goals

- Provide a pnpm/Turborepo monorepo with strict TypeScript.
- Separate web request handling from asynchronous worker processing.
- Establish DDD and logical CQRS package boundaries.
- Prepare PostgreSQL, Redis, Qdrant, LocalStack S3, DuckDB, LangChain, and LangGraph.
- Validate all boundary data and environment variables.
- Document architecture and operations for a clean clone.

## Developer Stories

- As a developer, I can install dependencies and run quality gates from the root.
- As a developer, I can start infrastructure without the app profile.
- As a developer, I can build container images for web and worker separately.
- As a developer, I can inspect liveness and readiness endpoints without leaking secrets.
- As a developer, I can extend the dataset aggregate without importing infrastructure.

## Functional Requirements

- Implement a `Dataset` aggregate with validated lifecycle transitions.
- Provide command/query bus abstractions and initial dataset creation command.
- Provide Zod contracts for API envelopes, dataset representations, queue jobs, and
  agent placeholders.
- Define Drizzle schemas for datasets, versions, analysis threads, messages, and outbox.
- Provide Redis-backed queues and rate limiter primitives.
- Provide S3-compatible storage and Qdrant readiness adapters.
- Provide an initial LangGraph state and two-node graph scaffold.
- Provide web `/api/health` and `/api/ready` routes.
- Provide worker startup, job validation, logging, and graceful shutdown.

## Non-Functional Requirements

- Node.js 22 or newer.
- Exact package versions pinned in `package.json`.
- Strict TypeScript with no `any`.
- Secrets are never logged or committed.
- Queue payloads are versioned and idempotency-aware.
- Containers run as non-root users.
- Infrastructure services use persistent local volumes.

## Acceptance Criteria

- `pnpm install` produces a lockfile.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- `docker compose --env-file .env -f docker/docker-compose.yml --profile app config` renders a valid Compose model.
- Web and worker Dockerfiles build.
- `/api/health` returns 200 when the web process is alive.
- `/api/ready` returns structured dependency results.

## Explicit Non-Goals

- Authentication and authorization flows.
- Complete CSV upload UI.
- Complete ingestion, profiling, arbitrary SQL, RAG ingestion, or dashboards.
- Production prompts or multi-agent orchestration.
- Kubernetes, service mesh, or unnecessary microservices.

## Failure Modes

- Environment validation fails before startup when required values are invalid.
- Missing CQRS handlers fail clearly.
- Duplicate CQRS registrations fail clearly.
- Invalid queue jobs are rejected by Zod validation.
- Readiness reports dependency failures without disclosing credentials.

## Definition of Done

The foundation is complete when code, tests, docs, containers, and validation commands
match the repository brief and deferred features are called out explicitly.
