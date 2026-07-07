# Foundation Plan

## Architecture Overview

The system is a modular monolith with two deployment processes: `apps/web` handles
HTTP requests and `apps/worker` handles queued asynchronous jobs.

Dependency direction:

```text
Domain <- Application <- Infrastructure <- Web / Worker
```

`packages/contracts` contains neutral Zod contracts. `packages/agent` owns LangGraph
state and graph composition. Infrastructure owns external clients and readiness checks.

## Repository Plan

- `apps/web`: Next.js App Router, React UI, Tailwind CSS styling,
  health/readiness routes, minimal landing page.
- `apps/worker`: BullMQ workers and processors.
- `packages/domain`: aggregate roots, domain errors, value objects, dataset aggregate.
- `packages/application`: CQRS buses, application ports, command handlers.
- `packages/contracts`: Zod schemas shared by apps and packages.
- `packages/infrastructure`: environment, database, queues, Redis, storage, vector,
  analytics, logging, readiness, rate limiting.
- `packages/agent`: graph state and placeholder analysis graph.

## Infrastructure Plan

Compose runs PostgreSQL with pgvector capability, Redis, Qdrant, LocalStack S3, web,
and worker. Web and worker are under the `app` profile.

## Environment Strategy

Environment access is centralized in the infrastructure package. Raw `process.env`
access outside adapters is prohibited. `.env.example` documents local defaults and
`.env.test` provides isolated test defaults.

## Security Strategy

No fake authentication layer is implemented. Object keys are scoped by owner and
dataset. Logs redact secret-like fields. Future model endpoints receive stricter rate
limits. Uploaded CSV content is untrusted data and must never become system prompts.

## Testing Strategy

Pure domain and application seams are covered by Vitest. Infrastructure tests focus on
pure validation logic and rate-limiter command construction where possible. Full
dependency readiness is validated through Docker Compose in local or CI-capable
environments.

The web package must pass lint, typecheck, formatting, and production build checks after
frontend styling changes.

## Migration Strategy

Drizzle Kit owns SQL migration generation and application. The initial schema is
outbox-ready but does not implement a complete publisher.

## Operational Commands

- `pnpm infra:up`
- `pnpm docker:config`
- `pnpm docker:build`
- `pnpm docker:up:build`
- `pnpm docker:ps`
- `pnpm docker:down`
