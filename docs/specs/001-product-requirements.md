# 001 — Product Requirements

**Contract status:** Approved  
**Implementation status:** Incremental; tracked only in [`../implementation.md`](../implementation.md)

This document defines the complete MVP outcome. It is not an implementation phase and must not be
marked complete until every success criterion in section 7 is verified. Delivery order and phase-level
definitions of done are defined in [019](./019-implementation-plan.md).

## 1. Product summary

Agentic CSV Analyst is a free, open-source application that provides a conversational interface for understanding and visualizing CSV data. It is designed as a production-grade portfolio project demonstrating React/Next.js with TypeScript, DDD/CQRS, LangChain, LangGraph, RAG, vector databases, queues, workers and secure multi-user data boundaries.

## 2. Primary user journey

1. A visitor creates an account or signs in.
2. The user opens Settings and securely adds an OpenAI API key.
3. The user validates the key and chooses an available model and reasoning effort.
4. The user starts a new conversation.
5. The empty chat requires a CSV upload before data questions can run.
6. The system uploads and profiles the CSV asynchronously.
7. The user asks a natural-language question.
8. The agent inspects schema/context, plans deterministic analysis and either:
   - asks a clarification, or
   - executes the analysis and returns an explanation plus optional graph.
9. The system proposes useful follow-up questions based on the dataset and current result.
10. The conversation, messages, charts, dataset references and memory remain available after reload and future sign-in.

## 3. Personas

### Data-curious user

Has a CSV and wants insights without writing SQL or chart code.

### Developer/evaluator

Reviews the architecture, source code, tests, agent graph, retrieval boundaries and operational design.

### Open-source contributor

Runs the project locally, adds providers or chart types, and validates changes through specifications and tests.

## 4. Functional capabilities

### Account

- Register, sign in, sign out and manage active sessions.
- Update name, email and password.
- Email changes require verification before becoming canonical.
- Password changes require current-password verification unless using a secure reset flow.

### Provider settings

- Add, validate, update and delete an OpenAI API key.
- Never reveal the full saved key.
- Select an available OpenAI model.
- Select supported reasoning effort.
- Default requested configuration: `gpt-5.5` with `medium` reasoning effort.
- If the default is unavailable to the account, show a clear validation state and require/fallback to an available compatible model according to the model-selection spec.

### Conversations

- Create, list, open, rename, archive and delete conversations.
- Persist all user and assistant messages.
- Persist clarification state, tool/run status and chart artifacts.
- Restore conversations after refresh or a later session.
- Display recent conversations in a left sidebar.

### Datasets

- Upload CSV only in the first release.
- Associate one or more datasets with a user, but one active dataset per conversation in the MVP.
- Show upload/profiling progress and errors.
- Show basic dataset identity and schema information.
- Prevent any cross-user access.

### Analysis

- Answer schema, aggregation, comparison, trend, distribution, data-quality and correlation questions.
- Ask clarifying questions when measures, dimensions, dates, filters or meanings are ambiguous.
- Execute calculations through DuckDB or a deterministic analytical engine.
- Generate a schema-validated chart specification.
- Preserve provenance: columns, filters, aggregations, assumptions and warnings.

### Suggestions

- Offer initial suggested prompts after profiling.
- Offer context-aware follow-ups after each answer.
- Clearly distinguish an unexecuted suggested question from a verified insight.

## 5. Non-functional requirements

- Strict TypeScript and runtime validation.
- Responsive UI and keyboard accessibility.
- Streaming or progressive status for agent runs.
- Read operations normally below 500 ms excluding provider/analysis execution.
- Explicit resource limits for uploads and analytical queries.
- Idempotent background processing.
- Structured logs, health endpoints and testable readiness checks.
- Secure secret storage and defense-in-depth tenant isolation.

## 6. Explicit non-goals for MVP

- Payment gateways, subscription tiers or billing.
- Gemini/Anthropic provider integration in the initial release; architecture may remain provider-extensible.
- Excel, PDF, database connectors or arbitrary file uploads.
- Multiple datasets joined in one conversation.
- User-authored SQL execution.
- Model-generated executable chart code.
- Autonomous web browsing.
- Multi-agent swarms.
- Forecasting or model training.
- Organization/team tenants; a user account is the tenant boundary initially.

## 7. Success criteria

The MVP is successful when two different users can upload similarly named CSV files, maintain independent chat histories, securely use their own OpenAI keys, ask questions, receive accurate calculated charts, and cannot access any resource belonging to the other user.

## 8. Delivery ownership

| Capability                                            | Owning phase |
| ----------------------------------------------------- | ------------ |
| Repository and operational foundation                 | Phases 0-1   |
| Accounts, sessions and tenant isolation               | Phase 2      |
| OpenAI credentials and model preferences              | Phase 3      |
| Persistent conversations and run streaming            | Phase 4      |
| CSV upload, validation and profiling                  | Phase 5      |
| Deterministic calculations and charts                 | Phase 6      |
| Agent orchestration and clarification                 | Phase 7      |
| Retrieval and memory                                  | Phase 8      |
| Suggestions, security review and portfolio completion | Phase 9      |

Partial infrastructure or schema scaffolding does not complete a capability. The owning phase must meet
its definition of done and the global definition of done before the capability is recorded as implemented.
