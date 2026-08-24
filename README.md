# Agentic CSV Analyst

Agentic CSV Analyst is a free, open-source application for exploring and visualizing CSV data through
a conversational interface. It is intended for people who want reliable answers from their data without
having to write SQL or chart code.

The product follows one central rule:

> The LLM plans and explains. Deterministic tools calculate. RAG retrieves semantic context.

Users can create an account, securely connect their own OpenAI API key, upload a CSV, and ask questions
in natural language. The application profiles the dataset, executes calculations through bounded
analytical tools, explains the result, shows its assumptions and provenance, and renders validated charts
when appropriate. Conversations, datasets, results, and confirmed context remain available
across sessions while staying isolated from every other user.

The project is being built as a production-minded modular monolith using Next.js, TypeScript, DDD/CQRS,
PostgreSQL, Redis and BullMQ, S3-compatible storage, DuckDB, Qdrant, LangChain, and LangGraph. It has no
billing system; users bring their own provider credentials.

## What Comes Next

The MVP phases now include identity and tenant isolation, secure per-user OpenAI settings, persistent
conversations, CSV ingestion, deterministic analytics, LangGraph orchestration, filtered RAG/memory,
schema-grounded prompt suggestions, cross-store dataset/account deletion and reproducible release evidence.
OpenAI plans and explains while an allow-listed compiler and bounded DuckDB execution control calculations.

The next work is deployment and operational validation: managed production secrets/KMS, observability,
backup/restore exercises, the documented cross-browser accessibility matrix and tagged-release smoke tests.
Optional later product extensions include conversation compaction, user preferences, broader document
retrieval, reranking, memory-management UI and verified insights backed by persisted result provenance.

Detailed progress and the authoritative next implementation slice are tracked in
[`docs/implementation.md`](./docs/implementation.md).
