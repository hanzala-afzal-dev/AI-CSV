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

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the maintainers through
the repository security reporting channel once configured.
