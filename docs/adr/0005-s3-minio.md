# ADR 0005: S3-Compatible Object Storage with MinIO

## Status

Accepted.

## Context

CSV files may be large and should not be proxied through request handlers. Local development also needs
uploaded objects to survive ordinary container stops and starts so PostgreSQL metadata cannot silently
outlive its analytical source.

## Decision

Use an S3-compatible object storage port and AWS SDK v3 adapter. MinIO provides the local S3 API and
stores objects directly in a named volume. A one-shot initialization service creates the development
bucket idempotently and enables versioning.

## Consequences

The application can use presigned direct uploads and user-scoped object keys. Normal stop/start cycles
preserve objects, while the explicit reset workflow intentionally deletes them. The same adapter shape
can target AWS S3 or another compatible service later.

## Rejected Alternatives

- Local filesystem uploads: rejected because it does not model production object storage.
- Proxying CSV bodies through Next.js: rejected because upload size and request runtime are poor fits for
  web handlers.
