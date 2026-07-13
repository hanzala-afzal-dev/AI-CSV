# Codex Implementation Brief: Production-Grade Agentic CSV Analyst Foundation

> Status: historical foundation contract. Active behavior is defined by `docs/specs/`, ADRs,
> and the current code. Do not rerun this brief as a replacement for an active feature spec.

## How to use this file

Give this entire file to Codex and ask it to execute the instructions in the target repository.

Codex must treat this document as the implementation contract for the **foundation/boilerplate phase** of the project. It must create the specifications and architecture records before or alongside the code, preserve any correct existing work, and validate the final repository with the commands defined below.

---

## 1. Role and working mode

Act as a senior TypeScript platform engineer and AI application architect.

Set up a production-minded portfolio project that demonstrates:

- Next.js with TypeScript
- Domain-Driven Design
- logical CQRS
- LangChain and LangGraph readiness
- RAG and vector-database readiness
- asynchronous queues and workers
- rate limiting
- typed environment configuration
- PostgreSQL persistence with an ORM
- S3-compatible object storage
- Docker Compose development and containerized execution
- testing, linting, CI, observability, and security fundamentals
- specification-driven development

Work autonomously. Do not stop after creating placeholder folders. Produce a coherent, runnable foundation.

Before modifying files:

1. Inspect the repository.
2. Preserve correct existing code and documentation.
3. Reconcile differences instead of blindly replacing files.
4. Do not delete user work unless it is clearly obsolete and the replacement is documented.
5. Do not ask for API keys or real secrets. Use documented placeholders in `.env.example`.

When choosing package versions:

- Use mutually compatible stable versions.
- Support Node.js 22 or newer.
- Pin exact versions in `package.json`.
- Generate and retain `pnpm-lock.yaml`.
- Do not use unverified or abandoned packages.

---

## 2. Product context

The eventual product is an **Agentic CSV Analyst**.

A user will upload a CSV file, inspect its structure, ask natural-language questions, and receive verified calculations and chart specifications.

The architectural principle is:

> The LLM plans and explains. Deterministic tools calculate. RAG retrieves semantic context.

Future capabilities will include:

- CSV upload and object storage
- dataset profiling
- DuckDB-based analytical queries
- LangChain tools
- LangGraph orchestration
- vector retrieval over schema descriptions, business rules, and textual data
- conversational analysis threads
- validated chart specifications

This task is only the **foundation phase**. Do not implement the full CSV analysis product yet.

---

## 3. Foundation scope

The completed foundation must include:

1. A pnpm monorepo.
2. Turborepo task orchestration.
3. A Next.js App Router web application.
4. A separate Node.js BullMQ worker application.
5. DDD/CQRS-oriented internal packages.
6. PostgreSQL with Drizzle ORM.
7. Redis for BullMQ and rate limiting.
8. Qdrant as the dedicated vector database.
9. LocalStack S3 for local object storage.
10. DuckDB infrastructure readiness for later CSV analysis.
11. LangChain/LangGraph package scaffolding.
12. Typed environment validation using Zod.
13. Structured logging.
14. Liveness and readiness endpoints.
15. Dockerfiles for web and worker.
16. Docker Compose for all dependencies and application processes.
17. Specification documents and ADRs.
18. A version-controlled `knowledge-base/` directory.
19. Unit-test, lint, formatting, type-check, build, and CI foundations.
20. Security, contribution, and operational documentation.

---

## 4. Explicit non-goals

Do not implement these during the foundation phase:

- full authentication or authorization flows
- the complete CSV upload UI
- complete ingestion or profiling logic
- arbitrary SQL generation
- complete RAG ingestion
- production LLM prompts
- chart dashboards
- multi-agent architecture
- autonomous web access
- Kubernetes
- service-mesh infrastructure
- unnecessary microservices

Stubs are acceptable only where a later specification is explicitly named. A stub must compile and clearly state what is deferred.

---

## 5. Architectural style

Use a **modular monolith** with separate deployment processes for web requests and asynchronous workers.

Use DDD boundaries and logical CQRS. Do not introduce event sourcing.

Dependency direction must be:

```text
Domain <- Application <- Infrastructure <- Web / Worker composition
```

Rules:

- `domain` must not import Next.js, Drizzle, Redis, BullMQ, Qdrant, LangChain, or any infrastructure package.
- `application` may depend on `domain` and abstract ports.
- `infrastructure` implements application ports.
- `web` and `worker` are composition roots.
- `contracts` contains framework-neutral Zod schemas shared across boundaries.
- `agent` contains LangGraph state and graph composition, not core domain rules.
- Request handlers must not perform long-running ingestion, embedding, or analytical work.
- Long-running tasks must be queued.

CQRS means separate command/query contracts and handlers. It does not mean separate databases at this stage.

---

## 6. Required repository structure

Create or reconcile this structure:

```text
agentic-csv-analyst/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   └── app/
│   │   │       ├── api/
│   │   │       │   ├── health/route.ts
│   │   │       │   └── ready/route.ts
│   │   │       ├── globals.css
│   │   │       ├── layout.tsx
│   │   │       └── page.tsx
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── worker/
│       ├── src/
│       │   ├── processors/
│       │   │   └── dataset-ingestion.processor.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── domain/
│   │   ├── src/
│   │   │   ├── dataset/
│   │   │   └── shared/
│   │   └── tests/
│   ├── application/
│   │   └── src/
│   │       ├── cqrs/
│   │       ├── datasets/
│   │       │   ├── commands/
│   │       │   └── queries/
│   │       └── ports/
│   ├── contracts/
│   │   └── src/
│   ├── infrastructure/
│   │   ├── drizzle/
│   │   └── src/
│   │       ├── analytics/
│   │       ├── config/
│   │       ├── database/
│   │       ├── health/
│   │       ├── logging/
│   │       ├── queue/
│   │       ├── rate-limit/
│   │       ├── redis/
│   │       ├── storage/
│   │       └── vector/
│   ├── agent/
│   │   └── src/
│   │       ├── knowledge-base/
│   │       ├── graph.ts
│   │       ├── state.ts
│   │       └── index.ts
│   └── config/
│       └── typescript/
├── knowledge-base/
│   ├── README.md
│   ├── examples/
│   ├── glossary/
│   └── policies/
├── docs/specs/
│   ├── constitution.md
│   ├── 000-foundation/
│   │   ├── spec.md
│   │   ├── plan.md
│   │   └── tasks.md
│   └── 001-csv-upload/
│       └── spec.md
├── docs/
│   ├── architecture.md
│   └── adr/
├── docker/
│   ├── compose.yaml
│   ├── docker-compose.yml.example
│   ├── .env.example
│   ├── Dockerfile.web
│   ├── Dockerfile.worker
│   ├── localstack/init/
│   └── postgres/init/
├── scripts/
│   └── check-env.mjs
├── storage/
│   └── .gitkeep
├── .github/
│   ├── workflows/ci.yml
│   ├── dependabot.yml
│   └── pull_request_template.md
├── .dockerignore
├── .editorconfig
├── .env.example
├── .env.test
├── .gitignore
├── .npmrc
├── CONTRIBUTING.md
├── drizzle.config.ts
├── eslint.config.mjs
├── LICENSE
├── Makefile
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── README.md
├── SECURITY.md
├── tsconfig.json
└── turbo.json
```

Small additions are allowed when justified. Do not collapse all code into one package.

---

## 7. Technology choices

Use:

- Node.js 22+
- pnpm workspaces
- Turborepo
- Next.js App Router
- React
- Tailwind CSS
- TypeScript strict mode
- Zod
- PostgreSQL
- Drizzle ORM and Drizzle Kit
- Redis
- BullMQ
- Qdrant
- AWS SDK v3 S3 client
- LocalStack for local S3
- DuckDB Node API for future in-process analytics
- LangChain JavaScript packages
- LangGraph JavaScript package
- Pino structured logging
- Vitest
- ESLint flat config
- Prettier

Do not add Prisma, NestJS, Express, Kafka, RabbitMQ, or another vector database.

PostgreSQL may use a pgvector-capable image for future flexibility, but Qdrant remains the primary vector store.

---

## 8. TypeScript standards

Apply these rules across the repository:

- `strict: true`
- no implicit `any`
- avoid `any`; external input begins as `unknown`
- validate boundary data with Zod
- use discriminated unions for stateful results
- use exhaustive `switch` handling where appropriate
- use type-only imports where applicable
- expose package APIs through `index.ts`
- do not import deep private paths across packages
- keep domain entities free from persistence decorators or framework types
- use typed domain errors with stable machine-readable error codes
- never access raw `process.env` outside the environment adapter

Configure workspace aliases consistently, for example:

```text
@agentic-csv/domain
@agentic-csv/application
@agentic-csv/contracts
@agentic-csv/infrastructure
@agentic-csv/agent
```

---

## 9. Domain foundation

Implement a small but meaningful domain model for a `Dataset` aggregate.

Required concepts:

- `AggregateRoot`
- `DomainEvent`
- `DomainError`
- `DatasetId` value object
- `Dataset` aggregate
- `DatasetStatus`

Dataset statuses:

```text
pending_upload
uploaded
profiling
ready
failed
```

The aggregate must enforce valid lifecycle transitions and record domain events such as:

```text
dataset.created
dataset.uploaded
dataset.profiling_started
dataset.ready
dataset.failed
```

Use UUIDs generated by the application/domain layer.

Add unit tests for:

- valid creation
- invalid dataset names
- valid status transitions
- invalid status transitions
- invalid profiling statistics
- required failure reason
- emitted domain events

---

## 10. Application and CQRS foundation

Create framework-neutral abstractions for:

- `Command`
- `CommandHandler`
- `Query`
- `QueryHandler`
- command bus
- query bus

The buses must:

- register handlers by stable command/query type
- reject duplicate registration
- fail clearly when a handler is missing
- preserve strong typing as far as reasonably possible

Add an initial `CreateDatasetCommand` and handler skeleton or implementation using ports.

Required application ports:

- `DatasetRepository`
- `ObjectStorage`
- `EventPublisher`

Do not import Drizzle, BullMQ, or AWS SDK types into the application package.

---

## 11. Shared contracts

Use Zod schemas for boundary contracts.

At minimum create contracts for:

- dataset API representations
- dataset ingestion queue job
- generic API success/error envelopes
- initial agent analysis state/output placeholders

Queue payloads must include:

- schema version
- job name/type
- correlation ID
- dataset ID
- owner or tenant scope
- object key
- attempt-independent idempotency key where appropriate

Job names must be versioned, for example:

```text
dataset.ingest.v1
knowledge.index.v1
outbox.publish.v1
```

---

## 12. Database and ORM

Use Drizzle ORM with PostgreSQL.

Create an initial schema containing:

### `datasets`

Fields should include:

- UUID primary key
- owner ID
- name
- original filename
- object key
- status enum
- row count
- column count
- failure reason
- created timestamp
- updated timestamp
- soft-delete timestamp

Add useful indexes and a uniqueness constraint preventing duplicate object keys within one owner scope.

### `dataset_versions`

Fields should include:

- UUID primary key
- dataset ID foreign key
- integer version
- JSONB schema profile
- JSONB statistical profile
- checksum
- active flag
- created timestamp

Enforce unique `(dataset_id, version)`.

### `analysis_threads`

Fields should include:

- UUID primary key
- owner ID
- dataset ID
- title
- LangGraph thread ID
- created timestamp
- updated timestamp

### `analysis_messages`

Fields should include:

- UUID primary key
- thread ID
- role
- JSONB content
- created timestamp

### `outbox_events`

Fields should include:

- event UUID
- aggregate UUID
- event name
- JSONB payload
- occurrence timestamp
- published timestamp
- attempts
- last error

Add Drizzle configuration and migration scripts.

The schema is outbox-ready; a complete outbox publisher can remain deferred.

---

## 13. Environment configuration

Create:

- `.env.example` with local-safe placeholders
- `.env.test` with isolated test defaults
- `.env` excluded from Git
- a Zod-based runtime environment parser
- a script that checks required variables without printing secret values

Required variable groups:

### Application

```text
NODE_ENV
APP_NAME
APP_URL
APP_PORT
LOG_LEVEL
AUTH_SECRET
```

### PostgreSQL

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
POSTGRES_PORT
DATABASE_URL
DATABASE_POOL_MAX
DATABASE_IDLE_TIMEOUT_MS
DATABASE_CONNECTION_TIMEOUT_MS
```

### Redis and queues

```text
REDIS_PORT
REDIS_URL
REDIS_KEY_PREFIX
QUEUE_PREFIX
WORKER_CONCURRENCY
QUEUE_JOB_ATTEMPTS
QUEUE_BACKOFF_DELAY_MS
```

### Qdrant

```text
QDRANT_PORT
QDRANT_GRPC_PORT
QDRANT_URL
QDRANT_API_KEY
QDRANT_COLLECTION
QDRANT_VECTOR_SIZE
```

### S3-compatible storage

```text
LOCALSTACK_PORT
S3_ENDPOINT
S3_PUBLIC_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
UPLOAD_MAX_BYTES
PRESIGNED_URL_TTL_SECONDS
```

### LLM and tracing

```text
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_EMBEDDING_MODEL
LANGSMITH_TRACING
LANGSMITH_API_KEY
LANGSMITH_PROJECT
```

### Rate limiting

```text
RATE_LIMIT_WINDOW_SECONDS
RATE_LIMIT_MAX_REQUESTS
RATE_LIMIT_AI_MAX_REQUESTS
```

### Observability

```text
OTEL_SERVICE_NAME
OTEL_EXPORTER_OTLP_ENDPOINT
```

Requirements:

- fail fast with readable validation errors
- redact secret values from logs
- allow empty development API keys where the related integration is not invoked
- require a minimum length for `AUTH_SECRET`
- distinguish host URLs from Docker-internal URLs through Compose overrides

---

## 14. Redis, queues, and workers

Use Redis for:

- BullMQ queues
- distributed rate limiting
- future short-lived cache and coordination

Define queues:

```text
dataset-ingestion
knowledge-indexing
outbox-publishing
```

Configure default job behavior:

- configurable attempt count
- exponential backoff
- bounded completed-job retention
- bounded failed-job retention
- stable queue prefix

Create a separate worker application that:

- creates the necessary BullMQ worker(s)
- validates incoming job payloads
- uses configurable concurrency
- logs job start, completion, retry, and failure with correlation IDs
- handles `SIGTERM` and `SIGINT`
- closes workers and connections gracefully
- does not silently swallow failures

The dataset-ingestion processor may remain a transparent deferred implementation, but it must validate its payload and log that profiling is deferred to a later specification.

Design jobs to be idempotent and safe to retry.

---

## 15. Rate limiting

Create a Redis-backed rate limiter abstraction and implementation.

Use an atomic strategy, such as a Lua script or a properly designed sorted-set operation.

Support:

- a general API limit
- a stricter AI endpoint limit
- stable keys containing route class and user/client identity
- configurable window and request count
- returned metadata such as allowed/denied, remaining count, and reset time

Do not rely only on in-memory rate limiting because the application may run more than one instance.

The limiter does not have to be attached to every route yet, but it must be production-usable and unit-testable.

---

## 16. Object storage

Implement an S3-compatible storage adapter using AWS SDK v3.

Support at minimum:

- bucket existence/readiness check
- presigned upload URL generation
- configurable expiry
- configurable endpoint
- path-style mode for LocalStack
- object key namespacing by owner/tenant and dataset

Do not proxy large CSV file bodies through Next.js in the eventual design. Presigned direct upload is the intended pattern.

Create a LocalStack initialization script that creates the development bucket idempotently.

---

## 17. Qdrant and knowledge-base readiness

Implement a Qdrant client factory and readiness check.

Provide a collection initialization function for a collection such as:

```text
knowledge_documents_v1
```

The vector size must come from environment configuration.

Future payloads will be filtered by:

```text
tenantId
ownerId
datasetId
datasetVersion
documentType
columnName
```

Create the version-controlled `knowledge-base/` directory with:

- a README describing its purpose
- an analytics policy stating that numerical results come from deterministic execution
- a chart-selection policy
- a domain glossary
- an example dataset description

Create a loader skeleton in the agent package that can read Markdown knowledge documents later. It must not perform embedding during application startup.

---

## 18. DuckDB readiness

Use the current DuckDB Node API package suitable for in-process Node.js analytics.

Create an infrastructure adapter/factory that can later:

- create an isolated in-memory or temporary analytical database
- open and close connections safely
- query CSV objects or downloaded temporary files
- apply timeouts and result-size controls

During this task, only provide a safe, compilable foundation. Do not implement LLM-generated SQL execution.

Document why DuckDB is embedded in the worker rather than deployed as a Docker network service.

---

## 19. LangChain and LangGraph foundation

Create an `agent` package containing:

- a typed LangGraph state schema
- an initial graph
- a dataset-context loading node
- an analysis-planning placeholder node
- exports through `index.ts`

The initial graph may be:

```text
START -> load_dataset_context -> plan_analysis -> END
```

The placeholder must clearly state that complete analysis planning is deferred to a later feature specification.

Do not place model calls in the domain layer.

Do not create multiple agents.

Keep LangChain/LangGraph dependencies isolated so ordinary application use cases can be tested without initializing model clients.

---

## 20. Next.js web application

Use the App Router.

Create:

- a polished but minimal landing page explaining the project architecture
- `GET /api/health` for liveness
- `GET /api/ready` for dependency readiness
- Tailwind CSS global styling without adding a component framework
- metadata and semantic HTML
- Server Components by default

### Liveness

`/api/health` must return success when the web process is alive. It must not fail because an external dependency is unavailable.

### Readiness

`/api/ready` must check required dependencies, at least:

- PostgreSQL
- Redis
- Qdrant
- S3/LocalStack

Return:

- HTTP 200 when required dependencies are ready
- HTTP 503 when one or more required dependencies are unavailable
- a structured JSON body listing dependency status
- no credentials or sensitive connection details

Ensure the Next.js build supports standalone output for Docker.

---

## 21. Structured logging and observability

Use Pino.

Requirements:

- JSON logs in production
- readable local output only if it does not complicate deployment
- configurable log level
- secret redaction
- correlation ID support
- contextual fields for service, queue, job, dataset, and owner
- no raw CSV content in ordinary logs
- no API keys, authorization headers, passwords, or signed URLs in logs

Provide readiness/liveness conventions in `docs/architecture.md`.

Prepare environment variables for future OpenTelemetry export, but do not require an observability backend in local Compose.

---

## 22. Docker and Docker Compose

Create multi-stage Dockerfiles:

- `docker/Dockerfile.web`
- `docker/Dockerfile.worker`

Requirements:

- use Node.js 22 Alpine or another justified minimal official image
- enable Corepack and the pinned pnpm version
- install workspace dependencies efficiently
- build only the needed application
- run as a non-root user
- copy only required runtime artifacts where practical
- web image must run Next.js standalone output
- worker image must run compiled JavaScript
- include a useful `.dockerignore`
- keep separate development targets for long-running local containers and production runner targets
- bind-mount source into local application containers and run workspace watch tasks so code changes do not
  require image rebuilds or container replacement

Create the auto-discovered `docker/compose.yaml` wrapper and local stack template with these services:

### `postgres`

- pgvector-capable PostgreSQL image
- persistent named volume
- environment variables with local defaults
- published development port
- `pg_isready` health check
- initialization directory mounted read-only

### `redis`

- persistent named volume
- append-only persistence
- `noeviction` policy for queues
- health check

### `qdrant`

- REST and gRPC ports
- persistent named volume
- local dashboard accessibility

### `localstack`

- S3 service only
- persistent named volume
- bucket initialization script
- health check

### `web`

- placed under Compose profile `app`
- built from `docker/Dockerfile.web`
- depends on healthy required infrastructure
- overrides host service URLs with Docker-internal hostnames
- exposes application port
- includes a health check against `/api/health`
- uses the development target and bind-mounted source for the local Compose workflow

### `worker`

- placed under Compose profile `app`
- built from `docker/Dockerfile.worker`
- depends on healthy infrastructure
- uses Docker-internal service URLs
- uses a graceful stop period
- uses the development target and bind-mounted source for the local Compose workflow

Use one internal bridge network and named volumes.

Required workflows must work:

```bash
# Validate Compose
docker compose --env-file .env -f docker/compose.yaml --profile app config --quiet

# Infrastructure only
docker compose --env-file .env -f docker/compose.yaml up -d postgres redis qdrant localstack mailpit

# Build application images
docker compose --env-file .env -f docker/compose.yaml --profile app build web worker

# Build and run full stack
docker compose --env-file .env -f docker/compose.yaml --profile app up -d --build

# Check status
docker compose --env-file .env -f docker/compose.yaml --profile app ps

# Follow logs
docker compose --env-file .env -f docker/compose.yaml --profile app logs -f --tail=200

# Stop while preserving data
docker compose --env-file .env -f docker/compose.yaml --profile app down

# Reset all local data
docker compose --env-file .env -f docker/compose.yaml --profile app down -v --remove-orphans
```

---

## 23. Root scripts and Makefile

Provide root scripts equivalent to:

```json
{
  "dev": "turbo dev",
  "build": "turbo build",
  "lint": "turbo lint",
  "typecheck": "turbo typecheck",
  "test": "turbo test",
  "test:coverage": "turbo test:coverage",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "infra:up": "docker compose --env-file .env -f docker/compose.yaml up -d postgres redis qdrant localstack mailpit",
  "infra:down": "docker compose --env-file .env -f docker/compose.yaml down",
  "infra:reset": "docker compose --env-file .env -f docker/compose.yaml down -v --remove-orphans",
  "docker:config": "docker compose --env-file .env -f docker/compose.yaml --profile app config --quiet",
  "docker:pull": "docker compose --env-file .env -f docker/compose.yaml pull postgres redis qdrant localstack mailpit",
  "docker:build": "docker compose --env-file .env -f docker/compose.yaml --profile app build web worker",
  "docker:build:web:production": "docker build --file docker/Dockerfile.web --target runner --tag agentic-csv-analyst-web:production .",
  "docker:build:worker:production": "docker build --file docker/Dockerfile.worker --target runner --tag agentic-csv-analyst-worker:production .",
  "docker:up": "docker compose --env-file .env -f docker/compose.yaml --profile app up -d",
  "docker:up:build": "docker compose --env-file .env -f docker/compose.yaml --profile app up -d --build",
  "docker:rebuild": "docker compose --env-file .env -f docker/compose.yaml --profile app up -d --build --force-recreate",
  "docker:stop": "docker compose --env-file .env -f docker/compose.yaml --profile app stop",
  "docker:start": "docker compose --env-file .env -f docker/compose.yaml --profile app start",
  "docker:ps": "docker compose --env-file .env -f docker/compose.yaml --profile app ps",
  "docker:logs": "docker compose --env-file .env -f docker/compose.yaml --profile app logs -f --tail=200",
  "docker:down": "docker compose --env-file .env -f docker/compose.yaml --profile app down",
  "docker:reset": "docker compose --env-file .env -f docker/compose.yaml --profile app down -v --remove-orphans",
  "env:check": "node scripts/check-env.mjs",
  "ci": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
}
```

Exact commands may differ if required by the final compatible package versions, but all capabilities must exist.

Add equivalent common targets to a `Makefile`.

---

## 24. Specification-driven development artifacts

Create `docs/specs/constitution.md` with these principles:

1. correctness before autonomy
2. specification before implementation
3. explicit architecture boundaries
4. type safety at boundaries
5. secure by default
6. asynchronous reliability
7. observability and operations
8. test the seams
9. small, reviewable increments
10. documentation is part of the product

Create `docs/specs/000-foundation/spec.md` containing:

- problem statement
- project goals
- user/developer stories
- functional requirements
- non-functional requirements
- acceptance criteria
- explicit non-goals
- failure modes
- definition of done

Create `docs/specs/000-foundation/plan.md` containing:

- architecture overview
- dependency direction
- repository/package plan
- infrastructure plan
- environment strategy
- security strategy
- testing strategy
- migration strategy
- operational commands

Create `docs/specs/000-foundation/tasks.md` with implementation tasks and completion checkboxes.

Create `docs/specs/001-csv-upload/spec.md` as the next feature specification. It should cover only:

- authenticated ownership boundary
- dataset creation
- presigned upload initiation
- upload completion
- object metadata validation
- enqueueing the ingestion job
- idempotency and failure states

Do not implement specification `001` during this task.

---

## 25. Architecture decision records

Create ADRs for at least:

1. modular monolith with DDD and logical CQRS
2. PostgreSQL with Drizzle ORM
3. Redis with BullMQ
4. Qdrant as primary vector store
5. S3-compatible object storage with LocalStack locally

Each ADR must include:

- status
- context
- decision
- consequences
- rejected alternatives

Also document why:

- the web and worker are separate processes
- DuckDB is in-process rather than a Compose service
- Qdrant is used even though PostgreSQL is pgvector-capable

---

## 26. Documentation

Create a high-quality `README.md` that includes:

- project purpose
- architecture diagram in text or Mermaid
- repository map
- prerequisites
- first-run instructions
- infrastructure-only development workflow
- fully containerized workflow
- explicit `docker compose build` commands
- migration commands
- health/readiness URLs
- Qdrant and LocalStack local URLs
- environment strategy
- quality commands
- specification-driven workflow
- important design constraints
- next feature specification

Create:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/architecture.md`
- pull-request template

Do not claim commands were validated unless they were actually run.

---

## 27. Security baseline

Implement and document these rules:

- secrets are never committed
- `.env` is ignored
- `.env.example` contains no real credentials
- log redaction is configured
- uploaded CSV content is untrusted data
- no uploaded cell content may be treated as system instructions
- long-running work is not performed in request handlers
- model-backed endpoints receive stricter rate limits
- object keys are scoped by owner/tenant and dataset
- future Qdrant retrieval requires owner/tenant, dataset, and version filters
- future analytical SQL must be read-only and allow-listed
- queues use validated, versioned payloads
- workers handle retries idempotently
- containers run as non-root users

Avoid implementing a fake security layer that gives a false impression of completed authentication.

---

## 28. Testing and quality gates

Add tests for the domain aggregate and other pure foundation logic.

Add appropriate tests for:

- CQRS bus missing handler
- duplicate handler registration
- environment parsing
- queue contract validation
- rate limiter behavior where practical without fragile timing assumptions

Configure:

- Vitest
- coverage command
- ESLint flat config
- Prettier
- TypeScript build/type-check
- Turborepo pipelines

Create a GitHub Actions CI workflow that runs on pull requests and the main branch:

```text
install with frozen lockfile
format check
lint
typecheck
test
build
```

Use dependency caching where appropriate.

Add Dependabot configuration for npm/pnpm and GitHub Actions.

---

## 29. Implementation sequence

Perform the work in this order:

### Phase 1: Specification and decisions

1. Create the engineering constitution.
2. Create the foundation specification, plan, and tasks.
3. Create ADRs.
4. Create architecture documentation.

### Phase 2: Workspace foundation

1. Configure pnpm workspaces.
2. Configure Turborepo.
3. Configure shared TypeScript settings.
4. Configure ESLint, Prettier, Vitest, and Git ignores.
5. Create package manifests and exports.

### Phase 3: Domain and application

1. Implement domain primitives and dataset aggregate.
2. Add domain tests.
3. Implement CQRS abstractions.
4. Add application ports and initial command.
5. Add shared contracts.

### Phase 4: Infrastructure

1. Add typed environment parser.
2. Add PostgreSQL/Drizzle schema and client.
3. Add Redis clients.
4. Add BullMQ queues.
5. Add rate limiter.
6. Add S3 adapter.
7. Add Qdrant adapter.
8. Add DuckDB foundation.
9. Add logging and readiness checks.

### Phase 5: Applications

1. Create Next.js application and health routes.
2. Create worker application and processors.
3. Create LangGraph foundation.
4. Create knowledge-base loader skeleton.

### Phase 6: Containers and operations

1. Create initialization scripts.
2. Create Dockerfiles.
3. Create Compose configuration.
4. Add root scripts and Makefile.
5. Complete README and operations docs.

### Phase 7: Validation

Run all available checks. Fix errors rather than suppressing them.

---

## 30. Required validation commands

Run and report the results of:

```bash
corepack enable
pnpm install
pnpm env:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docker:config
pnpm docker:build
pnpm docker:up
pnpm docker:ps
```

After startup, verify:

```text
GET http://localhost:3000/api/health -> HTTP 200
GET http://localhost:3000/api/ready  -> HTTP 200 when dependencies are healthy
Qdrant dashboard is reachable
LocalStack reports S3 healthy
The development S3 bucket exists
The worker starts and remains healthy/running
```

Then stop the stack while preserving data:

```bash
pnpm docker:down
```

If Docker, network access, or another external dependency is unavailable in the execution environment:

- do not fabricate success
- run every validation that remains possible
- state exactly what could not be validated and why
- leave the repository in a state where the user can run the missing checks locally

---

## 31. Definition of done

The task is complete only when all applicable items are true:

- [ ] The repository installs through pnpm.
- [ ] A committed pnpm lockfile exists.
- [ ] Workspace packages have valid dependency boundaries.
- [ ] TypeScript runs in strict mode.
- [ ] Domain tests pass.
- [ ] Linting passes.
- [ ] Type checking passes.
- [ ] The monorepo builds.
- [ ] Environment validation fails clearly on invalid values.
- [ ] PostgreSQL, Redis, Qdrant, and LocalStack are defined with persistent volumes.
- [ ] Web and worker images build from separate Dockerfiles.
- [ ] `pnpm docker:up:build` is documented.
- [ ] Health and readiness routes return structured responses.
- [ ] The worker handles graceful shutdown.
- [ ] Queue jobs are versioned and Zod-validated.
- [ ] Rate limiting uses Redis rather than process memory.
- [ ] Drizzle schema includes datasets, versions, threads, messages, and outbox events.
- [ ] The knowledge base exists with initial policies and glossary.
- [ ] LangGraph foundation compiles without requiring an API key at startup.
- [ ] The README is usable from a clean clone.
- [ ] Specs and ADRs accurately describe the implementation.
- [ ] CI configuration uses a frozen lockfile and runs all quality gates.
- [ ] No real secrets or generated runtime data are committed.

---

## 32. Prohibited shortcuts

Do not:

- put all business logic in Next.js route handlers
- let the domain package import infrastructure libraries
- use `any` to bypass type errors
- skip Zod validation at API, queue, environment, or agent boundaries
- store secrets in source files
- use an in-memory queue or in-memory rate limiter as the main implementation
- use SQLite instead of PostgreSQL
- use pgvector as a silent replacement for the required Qdrant service
- treat DuckDB as a remote database service
- implement arbitrary model-generated SQL execution
- embed every CSV row during startup
- create unnecessary microservices
- hide Docker build commands behind undocumented scripts
- state that Docker builds passed when Docker was not run
- leave broken placeholder imports or non-compiling stubs

---

## 33. Final response required from Codex

At the end, provide a concise implementation report containing:

1. Architecture summary.
2. Major files and packages created or changed.
3. Exact local setup commands.
4. Exact Docker build and startup commands.
5. Validation commands executed and their outcomes.
6. Any checks that could not be run, with the precise reason.
7. Known limitations intentionally deferred to later specifications.
8. The recommended next step: implement `docs/specs/001-csv-upload/spec.md`.

Do not provide only a high-level summary. The repository itself must contain the complete boilerplate and documentation described above.
