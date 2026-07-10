# CSV Upload Plan

## Boundaries

- Web authenticates, validates transport rules, and maps envelopes.
- Application owns dataset/upload use cases and stable workflow errors.
- Domain owns dataset lifecycle transitions.
- Infrastructure implements HMAC API keys, Drizzle transactions, S3 metadata, Redis limits, and
  outbox delivery.
- Worker validates queue contracts and performs deferred ingestion work.

## Data Model

Use `owners`, `api_keys`, `datasets`, `dataset_upload_intents`, `idempotency_records`, and
`outbox_events`. Foreign keys enforce owner cleanup. Unique constraints protect API-key hashes,
object keys, and owner/operation/idempotency tuples.

## Delivery Sequence

1. Apply the committed migration.
2. Create an owner and API key with the one-time CLI.
3. Create a dataset.
4. Initiate and execute a direct S3 upload using all signed headers.
5. Complete the upload with an idempotency key.
6. Dispatch the transactional outbox to BullMQ.
7. Validate the job in the worker; profiling remains deferred to specification `002`.

## Test Strategy

Cover domain rollback, strict contracts, metadata mismatch, idempotency replay/conflict, API-key
hashing, object-key scoping, rate-limit policy validation, CSRF/origin rejection, queue validation,
database migration, and a containerized LocalStack smoke test.
