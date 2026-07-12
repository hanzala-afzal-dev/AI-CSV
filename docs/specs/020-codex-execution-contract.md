# 020 — Codex Execution Contract

**Status:** Approved for implementation

## Mission

Implement the Agentic CSV Analyst in the existing repository according to every file in `docs/specs/`. The existing React frontend is authoritative user work and must be inspected and preserved unless a change is required by a specification.

## Working rules

1. Read `docs/implementation.md`, `docs/specs/000-constitution.md`, and
   `docs/specs/019-implementation-plan.md` first.
2. Inspect repository structure, package manager, frontend framework, current code and Docker files.
3. Create a short reconciliation report before large changes.
4. Implement one phase at a time; do not jump directly to a monolithic AI agent.
5. Add tests alongside each use case.
6. Preserve correct code; do not delete user work without documenting replacement.
7. Never ask for or invent a real API key.
8. Never commit `.env`, credentials or generated user data.
9. Use exact compatible package versions and generate a lockfile.
10. Run available validation commands and report failures honestly.

## Required technical outcomes

- DDD/CQRS dependency direction.
- User-account tenant boundary throughout PostgreSQL, storage, Redis keys, queues and Qdrant filters.
- Encrypted per-user OpenAI credentials with last-four-only UI.
- User-selectable model and reasoning effort, requested default `gpt-5.5` + `medium` when available.
- Persistent conversations/messages/runs/checkpoints.
- CSV-only upload and asynchronous profiling.
- Deterministic analysis and validated chart specs.
- LangGraph clarification/resume and memory.
- Version-controlled `knowledge-base/`.
- Explicit Docker Compose build/up/log/down commands.
- No payments or billing features.

## Implementation preference

- Keep a modular monolith with separate web/API and worker processes.
- Use Drizzle ORM and PostgreSQL.
- Use BullMQ/Redis.
- Use Qdrant.
- Use S3-compatible object storage.
- Use DuckDB embedded in workers for CSV/Parquet analytics.
- Use Zod for boundary and AI structured-output validation.
- Use LangChain and LangGraph for provider/tool/graph orchestration.

If the repository already made a compatible alternative choice, preserve it and create an ADR rather than replacing it automatically.

## Security blockers

Apply each blocker as soon as the affected capability or tenant-owned storage exists. A later-phase
capability that has not been introduced does not block an earlier phase. Do not mark a phase complete if
an applicable blocker remains:

- API key stored or returned in plaintext.
- missing ownership predicate on tenant data, or missing RLS after the tenant-boundary phase.
- model-generated executable chart code.
- unbounded analytical SQL/tool execution.
- CSV content included as trusted instructions.
- vectors searchable without user filter.
- messages/conversations stored only in Redis/browser.

## Validation commands

Adapt to the repository but provide equivalents for:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
docker compose config
docker compose build
docker compose up -d

docker compose ps
docker compose logs --no-color web worker
```

Commands for capabilities not yet introduced may be documented as not applicable, but every implemented
capability needs an executable equivalent. `pnpm quality` is the required local aggregate gate. Avoid
the reserved pnpm command `pnpm ci`; it performs a clean install rather than running package scripts. A hosted
GitHub Actions workflow is outside the current scope unless explicitly requested.

## Final report format

For each implementation phase, report:

- files and modules created/changed;
- migrations created;
- tests added and results;
- Docker/runtime validation performed;
- deviations/ADRs;
- known limitations and next phase.

Do not claim commands passed if they were not run or could not run.
