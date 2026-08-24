# Phase 9 security review

**Reviewed:** 2026-08-23
**Scope:** suggestions, analytical execution, memory retrieval, privacy deletion and release controls.

## Resolved findings

- Production responses set HSTS, CSP, frame denial, MIME sniffing protection, strict referrer policy,
  restricted browser capabilities, same-origin opener/resource policies and cross-domain policy denial.
  The CSP includes the configured public S3 origin only for direct uploads.
- Every cookie-authenticated mutation uses the centralized JSON, Fetch Metadata, trusted
  Origin/Referer, session and session-bound CSRF guard. Public identity mutations use the same
  origin validation without requiring a session.
- The general authenticated Redis bucket remains active on all browser mutations. Login/recovery,
  provider validation, chat submission, SSE, uploads and privacy deletion add narrower fail-closed
  IP, identifier or account buckets.
- SQL is either emitted by Drizzle with bound parameters or by the allow-listed analytical compiler.
  Explicit result sorting now appends deterministic field tie-breakers.
- Suggestion reads derive the actor and active dataset/version on the server and use forced RLS.
  Prompt-like CSV or retrieved content never becomes an instruction or executable operation.
- Dataset and account deletion require current-password reauthentication, trusted origin, CSRF and
  strict request schemas. The retryable worker cleans PostgreSQL, S3, Redis/BullMQ and Qdrant before
  retaining only hashed audit metadata.
- The security:secrets command scans tracked and untracked repository files for high-confidence
  provider, cloud, source-control, chat and private-key credentials without printing matched values.
- pnpm enforces a seven-day minimum release age. Security fixes have exact reviewed overrides.
  The security:audit command currently reports no known production vulnerabilities.
- Next.js was upgraded to 16.2.11 and affected Sharp, PostCSS, Nanoid and Undici versions were pinned
  to patched releases.

## Accepted boundaries

- Next.js requires inline bootstrap scripts and Tailwind emits inline styles, so the production CSP
  retains unsafe-inline for script/style while denying external script origins, objects, frames and
  base-URI changes. The UI never renders model or CSV HTML.
- A privacy request stores at most 1,000 unique object keys. Scheduling fails transactionally above
  that bound rather than performing a partial deletion; deployments with more than 1,000 retained
  objects per account need a reviewed manifest-pagination migration before accepting such accounts.
- Local development uses a configured encryption master key. Production deployments should use
  managed KMS envelope encryption and an operational key-rotation procedure.
- Automated provider tests use mocks and synthetic fixtures. A real OpenAI key is used only in the
  optional manual smoke test and remains encrypted in application storage.

## Verification

    pnpm security:check
    pnpm security:audit
    pnpm test:integration
    pnpm migration:check
