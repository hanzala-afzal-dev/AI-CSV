# CSV Upload Specification

## Scope

This is the next feature specification. It is not implemented in the foundation phase.

## Ownership Boundary

Every dataset belongs to an authenticated owner or tenant scope. The foundation does not
implement authentication; this feature must introduce a real ownership source before any
dataset mutation endpoint is exposed.

## Dataset Creation

The user provides a dataset name and original filename. The application validates the
request, creates a pending dataset aggregate, persists it, and returns an API envelope
with dataset metadata.

## Presigned Upload Initiation

The application generates an owner-scoped object key and a presigned S3-compatible URL.
Large CSV file bodies are uploaded directly to object storage, not proxied through
Next.js.

## Upload Completion

The client confirms completion. The application verifies object metadata, marks the
dataset uploaded, and enqueues ingestion.

## Object Metadata Validation

The system validates size, content type where available, checksum where provided, and
object namespace. Invalid objects move the dataset to a failed state with a stable
failure reason.

## Ingestion Queue

The upload completion command enqueues `dataset.ingest.v1` with schema version,
correlation ID, owner ID, dataset ID, object key, and attempt-independent idempotency key.

## Idempotency and Failure States

Repeated upload completion calls with the same idempotency key must not create duplicate
jobs. Failed validation must leave auditable state and must be safe to retry after a new
upload.
