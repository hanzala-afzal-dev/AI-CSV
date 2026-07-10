# ADR 0007: Transactional Outbox and Persistent Idempotency

## Status

Accepted.

## Context

Upload completion must update PostgreSQL and enqueue BullMQ work. A database commit followed by a
Redis failure can lose ingestion; an enqueue followed by rollback can process a nonexistent state.
Client retries can also create duplicate datasets or jobs.

## Decision

Commit dataset state, domain events, upload completion, idempotency response, and ingestion request
inside one PostgreSQL transaction. A worker dispatcher publishes pending ingestion outbox rows to
BullMQ with a deterministic job ID derived from the idempotency key, then marks the row published.

## Consequences

Redis availability is no longer part of the database commit. Dispatch is at-least-once, while the
stable BullMQ job ID and worker idempotency contract prevent duplicate effects. Outbox lag and failed
attempts become operational signals that require monitoring and retention policies.

## Rejected Alternatives

- Direct enqueue after commit: rejected because a Redis failure loses work.
- Enqueue before commit: rejected because workers can observe rolled-back state.
- Distributed transactions: rejected because PostgreSQL and Redis do not justify that complexity.
- In-memory retry: rejected because process crashes lose intent.
