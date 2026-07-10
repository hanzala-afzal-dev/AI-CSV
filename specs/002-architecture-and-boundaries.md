# 002 — Architecture and Bounded Contexts

**Status:** Approved for implementation

## 1. Style

Use a modular monolith with distinct web/API and worker processes. Apply DDD boundaries and logical CQRS. Avoid premature network microservices.

```text
Domain <- Application <- Infrastructure <- API/Web and Worker composition roots
```

The existing React frontend must be preserved. If it is a Next.js application, use App Router conventions. If it is a React SPA, expose the same backend contracts through a Node/TypeScript API. Do not rewrite a correct frontend merely to match a template.

## 2. Bounded contexts

### Identity

Users, credentials, sessions, email verification and password reset.

### Provider Configuration

Encrypted external-provider credentials, model catalog, selected model and reasoning settings.

### Dataset Management

Dataset aggregate, file versions, ingestion lifecycle, schema/profile and deletion.

### Conversation

Conversation aggregate, messages, runs, artifacts, title and archive state.

### Analytics

Analysis plans, safe query compilation/execution, typed result sets and provenance.

### Agent Orchestration

LangGraph workflow, tool routing, clarification interrupts, checkpoints and run lifecycle.

### Knowledge and Retrieval

Knowledge-base documents, embeddings, vector metadata, retrieval and validated memories.

### Operations

Queues, workers, rate limits, health, logging, metrics and outbox delivery.

## 3. Repository organization

A feature-first modular layout is preferred inside each architectural layer:

```text
apps/
  web/                    # existing React/Next.js frontend and BFF/API if applicable
  api/                    # optional when frontend is a separate SPA
  worker/
packages/
  domain/
    identity/
    provider-config/
    dataset/
    conversation/
    analytics/
  application/
    identity/
    provider-config/
    datasets/
    conversations/
    analytics/
    ports/
    cqrs/
  infrastructure/
    auth/
    database/
    encryption/
    object-storage/
    queue/
    redis/
    vector/
    analytics/
    observability/
  contracts/
  agent/
  config/
knowledge-base/
specs/
docs/adr/
```

## 4. Dependency rules

- Domain entities expose behavior, not public mutable fields.
- Domain is framework-neutral and persistence-ignorant.
- Application defines commands, queries, handlers and ports.
- Infrastructure implements repositories and external adapters.
- React components call application-facing HTTP contracts; they do not import infrastructure modules.
- LangGraph nodes invoke application services/tools; they must not directly query arbitrary tables.
- Queue processors are application adapters and must re-check ownership/authorization using persisted job context.

## 5. CQRS rules

Examples of commands:

- `RegisterUser`
- `ChangeEmail`
- `ChangePassword`
- `SaveProviderCredential`
- `SelectProviderModel`
- `CreateConversation`
- `UploadDatasetVersion`
- `SubmitChatMessage`
- `ArchiveConversation`
- `DeleteDataset`

Examples of queries:

- `GetCurrentUserSettings`
- `ListAvailableModels`
- `ListConversations`
- `GetConversationTimeline`
- `GetDatasetProfile`
- `GetAgentRunStatus`

Commands and queries may share PostgreSQL but must have distinct handlers and response contracts.

## 6. Process responsibilities

### Web/API process

- Authentication/session handling.
- Settings APIs.
- Conversation and dataset metadata APIs.
- Presigned upload orchestration.
- Starting agent runs.
- SSE/WebSocket delivery of persisted run events.
- Fast validation and authorization.

### Worker process

- CSV validation and profiling.
- CSV-to-Parquet normalization where enabled.
- Embedding and vector indexing.
- Long-running analytical execution.
- Conversation compaction and memory extraction.
- Outbox/event delivery.

### PostgreSQL

System of record for users, encrypted credentials, dataset metadata, conversations, messages, runs, memories, chart artifacts, job state and outbox records.

### Object storage

Original CSV and normalized analytical files.

### Redis

BullMQ, distributed rate limiting, short-lived locks, run-event fanout and optional caches. Redis is not the source of truth for chat history.

### Qdrant

Semantic documents and memories with mandatory user/dataset payload filters.

### DuckDB

Deterministic CSV/Parquet inspection and analytical calculations. It is embedded in worker/server processes rather than deployed as a network database.
