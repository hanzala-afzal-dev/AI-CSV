# 022 - Phase 9 Suggestions and Hardening Execution Contract

**Status:** Implemented

## 1. Goal

Complete the MVP with useful schema-grounded prompt suggestions, reproducible evaluation artifacts and a
documented security/accessibility release review. Suggestions guide the next question; they are not factual
insights and must never imply that an analysis ran when it did not.

## 2. Suggestion contracts and ownership

- Define strict versioned contracts for initial and follow-up suggestions with stable server-generated IDs,
  display text, prompt text, source type and referenced stored column IDs.
- Generate initial suggestions deterministically from the authorized active dataset profile. Generate
  follow-ups only from the completed question, validated plan and verified result shape.
- Return three to six diverse initial prompts and at most four follow-ups. Exclude duplicates, the
  just-completed question, incompatible column types and operations outside the Phase 6 allowlist.
- Suggestions are derived data and must not accept `userId`, dataset IDs, result IDs or column IDs from the
  browser or model. Reads use the authenticated actor and existing tenant-owned repositories.
- Deterministic generation is the baseline. Model-assisted ranking is a later optimization and cannot weaken
  type compatibility, authorization, cost bounds or reproducibility.

## 3. User experience

- Show initial suggestions only after a dataset version is ready and follow-ups only after a completed
  verified answer.
- Use the existing composer submission path so CSRF, Origin/Referer, rate limits, idempotency and active-run
  constraints remain centralized.
- Components must support keyboard operation, visible focus, loading, empty and stale-dataset states. Long
  labels wrap without shifting the composer or chart layout.
- Clicking a suggestion fills or submits its exact shown prompt according to one consistent interaction
  contract; it must not create a hidden memory or execute an unshown question.

## 4. Verified insights

Verified insight generation is optional. If implemented, every factual claim must reference a persisted
deterministic result artifact and provenance. Column names, profiles, samples, embeddings and model prose
alone can never support a verified insight.

## 5. Evaluation and release evidence

- Add a synthetic version-controlled corpus covering numeric plans/results, chart compatibility,
  clarification, memory reuse/non-reuse, prompt injection, missing columns and retrieval isolation.
- Provide deterministic evaluators and machine-readable plus human-readable reports. Calculations,
  authorization and leakage cannot use an LLM judge.
- Keep provider-dependent automation on mock/recorded boundaries with no real API key. Document an optional
  manual real-provider smoke separately.
- Review security headers, mutation CSRF/origin controls, rate-limit coverage, safe logging, dependency audit
  policy and secret scanning. Keep any release-blocking gap visible in `docs/implementation.md`.
- Review keyboard navigation, focus order, labels, live status announcements, chart alternatives, contrast and
  responsive overflow across the primary workflow.

## 6. Remaining deletion workflows

Phase 9 must either deliver authenticated, re-authorized and idempotent dataset/account deletion across
PostgreSQL, object storage, queues, Redis and Qdrant, or remain `Partial` with those global MVP gaps listed.
Deletion retains only safe audit metadata and failed derivative cleanup remains retryable.

## 7. Required verification

- A dataset without a date column never receives a time-trend suggestion.
- Suggestions reference only columns present in the active compatible version.
- A completed question is not repeated as a follow-up after reload.
- Clicking a suggestion uses the normal protected submission route and survives an SSE reconnect.
- Numeric, chart, clarification and memory cases produce reproducible evaluator results.
- Alice/Bob API, PostgreSQL, queue, object and vector isolation stays at zero leakage.
- Prompt-like CSV/retrieval content cannot alter suggestions, tools, ownership or policy.
- The local quality, integration, migration-from-empty and production build gates pass.

## 8. Definition of done

Phase 9 is implemented when suggestion behavior is useful and type-correct, the evaluation report and release
review are reproducible, accessibility findings are resolved or documented, open-source setup and demo data
are honest, remaining MVP deletion workflows are closed, and all mandatory local gates pass.
