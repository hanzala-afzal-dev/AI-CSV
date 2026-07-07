# ADR 0003: Redis with BullMQ

## Status

Accepted.

## Context

CSV ingestion, profiling, future embeddings, and outbox publishing are long-running or
retryable tasks.

## Decision

Use Redis as the coordination store and BullMQ for queues.

## Consequences

Jobs can be retried, observed, and processed outside request handlers. Redis also
supports distributed rate limiting.

## Rejected Alternatives

- In-memory queues: rejected because they fail with multiple processes.
- RabbitMQ or Kafka: rejected as unnecessary operational scope for this phase.
