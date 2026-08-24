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
- Object keys are scoped by user, dataset, and version.
- Qdrant retrieval requires user, dataset, and compatible-version filters.
- Analytical SQL is read-only, compiler-owned, allow-listed and parameterized.
- Queue payloads are validated and versioned.
- Workers must be idempotent and safe to retry.
- Containers run as non-root users.

## Implemented Request Controls

- API keys contain 256 bits of random material and are stored as HMAC-SHA-256 digests.
- Every mutable dataset lookup is constrained by authenticated user ID and forced PostgreSQL RLS.
- Browser mutations require JSON, trusted Origin/Referer and session-bound CSRF.
- Redis rate limiting is applied before and after authentication and fails closed.
- Upload completion verifies signed S3 metadata, size, content type, and checksum.
- Drizzle parameterizes application queries; route input is never interpolated into SQL.
- Browser sessions use opaque HTTP-only SameSite cookies; persisted tokens are hashed.
- OpenAI credentials are validate-before-replace, encrypted with AES-256-GCM and never returned.
- Dataset/account deletion is reauthenticated, queued, idempotent and retryable across all stores.
- Production responses include HSTS, CSP, frame, MIME, referrer and capability restrictions.
- `pnpm security:check` scans secrets and supply-chain policy; `pnpm security:audit` checks advisories.

The completed Phase 9 review and accepted boundaries are in
[`docs/reviews/phase-9-security.md`](./docs/reviews/phase-9-security.md).

## Reporting

Do not open a public issue for a suspected vulnerability. Until a private repository security
channel is configured, contact the repository owner directly through the hosting account.
