# CSV Upload Specification

## Status

Implemented. This specification defines the Phase 1 API contract.

## Problem Statement

An authenticated owner must be able to register a CSV dataset, upload the file directly to
S3-compatible storage, prove that the expected object was stored, and request asynchronous
ingestion without allowing cross-owner access or duplicate jobs.

## Goals

- Establish a real owner boundary using revocable opaque API keys.
- Keep CSV bodies out of the Next.js process through presigned `PUT` uploads.
- Verify object identity, namespace, size, media type, and SHA-256 checksum.
- Commit dataset state, audit events, idempotency, and ingestion intent atomically.
- Deliver ingestion through a retry-safe PostgreSQL outbox and BullMQ job.
- Apply strict validation, CSRF defenses, rate limiting, and parameterized persistence.

## Non-Goals

- Interactive browser login, registration, or OAuth sessions.
- CSV parsing, schema inference, profiling, or analytical queries.
- RAG indexing, model calls, charts, or conversational analysis.
- Exposing uploaded objects publicly.

## Authentication and Ownership

Clients send `Authorization: Bearer <api-key>`. Keys contain 256 random bits; PostgreSQL stores
only an HMAC-SHA-256 digest, prefix, owner, expiry, and revocation metadata. All dataset and
upload-intent reads include authenticated `owner_id`. Resource IDs alone never authorize access.

API keys are for server, CLI, and development clients. A browser UI must not store them in local
storage; interactive browser authentication requires a later OAuth/session specification.

## HTTP Contract

All mutation routes require `Content-Type: application/json`. Successful and failed responses use
the shared API envelope and include a correlation ID.

### Create Dataset

`POST /api/v1/datasets`

Request:

```json
{ "name": "Quarterly sales", "originalFilename": "sales-q1.csv" }
```

The server derives the owner from the API key, creates a `pending_upload` aggregate, and commits
the dataset and domain event in one transaction. Response status is `201` with dataset metadata.

### Initiate Upload

`POST /api/v1/datasets/{datasetId}/upload`

Request:

```json
{
  "contentType": "text/csv",
  "sizeBytes": 1024,
  "checksumSha256": "base64-encoded-sha256-checksum"
}
```

Allowed media types are `text/csv`, `application/csv`, and `text/plain`. Size must be positive and
must not exceed `UPLOAD_MAX_BYTES`. The response contains an upload-intent ID, owner/dataset/intent
scoped object key, expiring presigned `PUT` URL, and every required signed header.

### Complete Upload

`POST /api/v1/datasets/{datasetId}/upload/complete`

Required header: `Idempotency-Key` containing 16 to 200 URL-safe characters.

Request:

```json
{ "uploadIntentId": "uuid" }
```

The application checks intent ownership and expiry, then reads S3 metadata. Completion is rejected
unless byte size, content type, SHA-256 checksum, owner metadata, and dataset metadata exactly match
the intent.

## Transaction and Delivery

Completion reserves the owner/operation/idempotency tuple and locks the upload intent and dataset.
The following changes commit in one PostgreSQL transaction:

1. Dataset transitions to `uploaded`.
2. Domain events are appended to the outbox.
3. Upload intent is marked complete.
4. `dataset.ingest.v1` is appended to the outbox.
5. The stable response is stored on the idempotency record.

The worker polls unpublished ingestion outbox rows and adds BullMQ jobs with a deterministic job ID
derived from the idempotency key. Re-dispatch after a crash therefore resolves to the existing job.

## Security Requirements

- Redis limits invalid credential buckets before database authentication and owners afterward.
- Future AI routes use `RATE_LIMIT_AI_MAX_REQUESTS`; upload routes use the general policy.
- Cross-site fetch metadata, foreign origins, and non-JSON mutation requests are rejected.
- Bearer credentials are non-ambient, so a cross-site browser cannot attach authentication itself.
- Zod schemas are strict and reject unknown fields.
- Drizzle parameterizes every user-influenced relational query; no input is concatenated into SQL.
- Object path segments must be UUIDs and filenames are normalized.
- API keys, authorization headers, CSV contents, and presigned URLs must not be logged.

## Stable Failures

- `AUTHENTICATION_REQUIRED` -> 401
- `RATE_LIMIT_EXCEEDED` -> 429
- `DATASET_NOT_FOUND` or `UPLOAD_INTENT_NOT_FOUND` -> 404
- `DATASET_UPLOAD_STATE_INVALID` -> 409
- `UPLOAD_TOO_LARGE` -> 413
- `UPLOAD_INTENT_EXPIRED` -> 410
- `UPLOAD_OBJECT_METADATA_MISMATCH` -> 422
- `IDEMPOTENCY_KEY_REUSED` or `IDEMPOTENCY_REQUEST_IN_PROGRESS` -> 409

## Acceptance Criteria

- A clean database migrates all owner, API-key, upload-intent, idempotency, and outbox tables.
- Cross-owner dataset and upload-intent access returns not found.
- Invalid API keys cannot reach the workflow.
- A cross-site or form-encoded mutation is rejected.
- Uploads over the configured maximum are rejected before intent persistence.
- Incorrect object metadata cannot mutate dataset state.
- A completed request can be replayed with the same idempotency key and response.
- Reusing that key for another request fails without mutation.
- Dataset state and ingestion request are atomic.
- Worker payload validation rejects malformed jobs.

## Definition of Done

The feature is complete when migrations, contracts, application workflow, adapters, routes, worker
delivery, security documentation, unit tests, container build, and a LocalStack-backed runtime smoke
test pass.
