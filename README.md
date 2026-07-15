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

Identity, tenant isolation, secure per-user OpenAI settings, the persistent conversation workspace, and
CSV ingestion are in place. Users can upload directly to isolated object storage, leave while a BullMQ
worker validates and profiles the file with bounded DuckDB resources, then return to a durable dataset
summary and schema-based prompt suggestions.

The next product milestone is deterministic analytics and charts: typed analysis plans, an allow-listed
plan-to-query compiler, bounded read-only DuckDB execution, persisted results and provenance, and trusted
React chart renderers. Later phases add real agent orchestration with the user's OpenAI key, retrieval and
memory, then final security and accessibility hardening.

Detailed progress and the authoritative next implementation slice are tracked in
[`docs/implementation.md`](./docs/implementation.md).
