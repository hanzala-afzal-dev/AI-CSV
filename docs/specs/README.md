# Agentic CSV Analyst — Specification Index

This directory is the source of truth for product behavior and architecture. Code must implement these specifications; code must not silently redefine them.

## Product objective

Build a free, open-source, multi-user CSV analytics assistant with a familiar ChatGPT/Gemini/Claude-style interface. Each authenticated user owns isolated datasets, conversations, messages, API credentials, memories, analysis runs, and generated visualizations.

The assistant must let a user upload a CSV, ask natural-language questions, clarify ambiguous requests, calculate answers with deterministic data tools, render validated charts, and suggest useful follow-up questions or verified insights.

## Architectural principle

> The LLM plans, selects tools, asks clarifying questions, and explains. Deterministic tools inspect and calculate. RAG retrieves semantic context. The frontend renders validated specifications rather than executing model-generated code.

## Specification map

| ID  | Specification                                                            | Purpose                                                  |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| 000 | [Constitution](./000-constitution.md)                                    | Non-negotiable engineering and AI rules                  |
| 001 | [Product requirements](./001-product-requirements.md)                    | Scope, personas, capabilities, non-goals                 |
| 002 | [Architecture and boundaries](./002-architecture-and-boundaries.md)      | DDD, CQRS, processes, dependency rules                   |
| 003 | [Identity and multi-tenancy](./003-identity-and-multi-tenancy.md)        | Authentication, authorization, tenant isolation          |
| 004 | [Settings and API credentials](./004-settings-api-credentials-models.md) | Profile, password, encrypted OpenAI key, model selection |
| 005 | [Conversation and chat](./005-conversation-and-chat.md)                  | Persistent chats, messages, runs, streaming              |
| 006 | [CSV datasets and ingestion](./006-csv-datasets-and-ingestion.md)        | Upload, lifecycle, profiling, storage, queues            |
| 007 | [Agent workflow](./007-agent-workflow.md)                                | LangGraph state, nodes, tools, clarification             |
| 008 | [Charts and analytical output](./008-charts-and-analysis-output.md)      | Chart schema, SQL safety, result provenance              |
| 009 | [Memory and context](./009-memory-and-context.md)                        | Thread, dataset and preference memory                    |
| 010 | [RAG and knowledge base](./010-rag-and-knowledge-base.md)                | Embedding scope, retrieval filters, KB folder            |
| 011 | [Suggestions and insights](./011-suggestions-and-insights.md)            | Prompt suggestions and verified findings                 |
| 012 | [Data model](./012-data-model.md)                                        | PostgreSQL entities, relationships and invariants        |
| 013 | [API and event contracts](./013-api-and-event-contracts.md)              | HTTP, SSE, commands, events, queue payloads              |
| 014 | [Infrastructure and operations](./014-infrastructure-and-operations.md)  | Docker, queues, rate limiting, logging, health           |
| 015 | [Frontend UX](./015-frontend-ux.md)                                      | React information architecture and interactions          |
| 016 | [Security and privacy](./016-security-and-privacy.md)                    | Threat model, secrets, CSV prompt injection, deletion    |
| 017 | [Testing and evaluation](./017-testing-and-evaluation.md)                | Unit, integration, tenancy, agent and RAG evals          |
| 018 | [Open-source requirements](./018-open-source-requirements.md)            | No billing, BYOK, licensing and contributor experience   |
| 019 | [Implementation plan](./019-implementation-plan.md)                      | Ordered delivery phases and definition of done           |
| 020 | [Codex execution contract](./020-codex-execution-contract.md)            | Instructions for implementing from these specs           |

## How to use

1. Read `000-constitution.md` first.
2. Implement work in the order in `019-implementation-plan.md`.
3. Before coding a feature, convert its acceptance criteria into tests.
4. Record architecture deviations as ADRs.
5. Update a specification before changing externally visible behavior.

## Status convention

Each specification starts with a status. The initial set is **Approved for implementation**. A future breaking revision must include a migration note.

"Approved for implementation" describes the contract, not the current code status. Implementation is
tracked separately below so planned behavior is never presented as shipped behavior.

## Implementation status

Specification approval and implementation completion are separate states. The authoritative status,
verification evidence, known limitations, and next phase are maintained in
[`../implementation.md`](../implementation.md). Do not duplicate progress tables in individual specs.
