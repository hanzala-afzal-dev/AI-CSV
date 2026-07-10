# Security

## Baseline Rules

- Secrets are never committed.
- `.env` is ignored.
- `.env.example` contains local placeholders only.
- Logs redact API keys, authorization headers, passwords, signed URLs, and secrets.
- Uploaded CSV content is untrusted data.
- Uploaded cell content must never be treated as system instructions.
- Long-running work is queued, not performed in request handlers.
- Model-backed endpoints must use stricter rate limits.
- Object keys are scoped by owner or tenant and dataset.
- Future Qdrant retrieval requires owner, tenant, dataset, and version filters.
- Future analytical SQL must be read-only and allow-listed.
- Queue payloads are validated and versioned.
- Workers must be idempotent and safe to retry.
- Containers run as non-root users.

## Implemented Request Controls

- API keys contain 256 bits of random material and are stored as HMAC-SHA-256 digests.
- Every mutable dataset lookup is constrained by authenticated owner ID.
- Browser mutations require JSON and reject cross-site fetch metadata and untrusted origins.
- Redis rate limiting is applied before and after authentication and fails closed.
- Upload completion verifies signed S3 metadata, size, content type, and checksum.
- Drizzle parameterizes application queries; route input is never interpolated into SQL.
- Idempotency records and ingestion requests are committed in the dataset transaction.

Bearer keys must not be stored in browser local storage. An interactive browser client needs
a separately specified OAuth/session flow with secure, HTTP-only cookies.

## Reporting

Do not open a public issue for a suspected vulnerability. Until a private repository security
channel is configured, contact the repository owner directly through the hosting account.
