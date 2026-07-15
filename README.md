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

Identity, tenant isolation, secure per-user OpenAI settings, and the persistent conversation workspace
are in place. Conversations, messages, run state, and reconnectable server-sent events are durable in
PostgreSQL; a deterministic placeholder assistant proves the complete workflow before model orchestration.

The next product milestone is CSV upload and profiling: direct object-storage upload, defensive CSV
validation, DuckDB profiling, persisted dataset status, and schema-based prompt suggestions. Later phases
add deterministic analytics and charts, real agent orchestration with the user's OpenAI key, retrieval and
memory, then final security and accessibility hardening.

Detailed progress and the authoritative next implementation slice are tracked in
[`docs/implementation.md`](./docs/implementation.md).
