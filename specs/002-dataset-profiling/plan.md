# Dataset Profiling Plan

## Implementation Order

1. Define profiling limits, stable failure codes, and versioned profile contracts.
2. Add representative safe and adversarial CSV fixtures.
3. Implement bounded object download and temporary workspace lifecycle.
4. Implement DuckDB adapter with allow-listed statements and cancellation.
5. Implement deterministic delimiter/header/type/statistics pipeline.
6. Add transactional dataset-version persistence and idempotency.
7. Wire the ingestion processor, retry classification, logs, and metrics.
8. Validate with PostgreSQL, LocalStack, worker, and container smoke tests.

## Architecture

Domain owns lifecycle rules. Application orchestrates profiling through object, analytics, and
version-store ports. Infrastructure owns S3 download, DuckDB, temporary files, and Drizzle. The
worker is the composition root and validates the queue payload before invoking the application.

## Rollout

Keep profiling concurrency low by default. Measure duration, bytes, rows, failures, retries, and
temporary disk usage. Do not begin RAG or analysis endpoints until deterministic profiles are stable.
