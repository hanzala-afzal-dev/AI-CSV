# ADR 0004: Qdrant as Primary Vector Store

## Status

Accepted.

## Context

Future RAG needs vector collections with payload filters for tenant, owner, dataset,
version, document type, and column metadata.

## Decision

Use Qdrant as the dedicated vector database.

## Consequences

Vector lifecycle and retrieval filters are kept separate from relational persistence.
PostgreSQL can still run a pgvector-capable image for optional future experiments.

## Rejected Alternatives

- pgvector as the primary vector store: rejected because the brief requires Qdrant and
  because retrieval operations should not silently couple to relational persistence.
- Other vector databases: rejected to keep the foundation focused.
