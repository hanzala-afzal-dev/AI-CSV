# ADR 0005: S3-Compatible Object Storage with LocalStack

## Status

Accepted.

## Context

CSV files may be large and should not be proxied through request handlers.

## Decision

Use an S3-compatible object storage port and AWS SDK v3 adapter. LocalStack provides S3
locally.

## Consequences

The application can use presigned direct uploads and owner-scoped object keys. The same
adapter shape can target AWS S3 or another compatible service later.

## Rejected Alternatives

- Local filesystem uploads: rejected because it does not model production object
  storage.
- Proxying CSV bodies through Next.js: rejected because upload size and request runtime
  are poor fits for web handlers.
