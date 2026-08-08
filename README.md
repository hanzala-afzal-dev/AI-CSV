# Agentic CSV Analyst

Agentic CSV Analyst is a free, open-source application for exploring and visualizing CSV data through
a conversational interface. It is intended for people who want reliable answers from their data without
having to write SQL or chart code.

The product follows one central rule:

> The LLM plans and explains. Deterministic tools calculate. RAG retrieves semantic context.

A user will be able to create an account, securely connect their own OpenAI API key, upload a CSV, and
ask questions in natural language. The application will profile the dataset, execute calculations through
bounded analytical tools, explain the result, show its assumptions and provenance, and render validated
charts when appropriate. Conversations, datasets, results, and confirmed context will remain available
across sessions while staying isolated from every other user.

The project is being built as a production-minded modular monolith using Next.js, TypeScript, DDD/CQRS,
PostgreSQL, Redis and BullMQ, S3-compatible storage, DuckDB, Qdrant, LangChain, and LangGraph. It has no
billing system; users bring their own provider credentials.

## What Comes Next

Identity, tenant isolation, secure per-user OpenAI settings, persistent conversations, CSV ingestion,
deterministic analytics, and stateful LangGraph orchestration are in place. Users can upload a CSV, ask
natural-language analytical questions, answer material clarifications after a reload, and receive verified
results, provenance and trusted charts. OpenAI creates strict plans and explanations; an allow-listed
compiler and bounded DuckDB execution remain in control of every calculation.

The next product milestone is tenant-filtered retrieval and typed memory. It will index dataset semantics
and explicitly confirmed business definitions, retrieve only compatible user/dataset versions, disclose
rules applied to a plan, and coordinate deletion across PostgreSQL and Qdrant. The final phase adds
follow-up suggestions, evaluation artifacts, accessibility review and release hardening.

Detailed progress and the authoritative next implementation slice are tracked in
[`docs/implementation.md`](./docs/implementation.md).
