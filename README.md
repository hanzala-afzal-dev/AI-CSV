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

Identity, tenant isolation, secure per-user OpenAI settings, the persistent conversation workspace, CSV
ingestion, and deterministic analytics are in place. Users can upload directly to isolated object storage,
wait for bounded profiling, ask common analytical questions, and reload persisted results, provenance,
tables, and trusted charts. Calculations use an allow-listed plan compiler and bounded DuckDB execution;
they do not rely on model-written SQL.

The next product milestone is stateful LangGraph orchestration using the user's encrypted OpenAI
credential and selected model. It adds structured planning, material-ambiguity clarification and resume,
bounded repair, verification, cancellation and replayable progress while keeping deterministic tools in
control of calculations. Later phases add tenant-filtered retrieval and memory, then final security,
evaluation and accessibility hardening.

Detailed progress and the authoritative next implementation slice are tracked in
[`docs/implementation.md`](./docs/implementation.md).
