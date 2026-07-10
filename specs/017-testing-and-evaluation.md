# 017 — Testing and AI Evaluation

**Status:** Approved for implementation

## 1. Test pyramid

### Unit

- domain aggregate transitions
- value objects and schemas
- command/query handlers with ports mocked
- encryption round-trip and tamper failure
- query compiler
- chart validator
- memory selection/compaction logic
- rate-limit policy calculations

### Integration

- Drizzle repositories with PostgreSQL
- RLS ownership behavior
- Redis/BullMQ worker behavior
- Qdrant metadata filters
- object-storage presigned flow
- DuckDB analysis against fixture CSV/Parquet
- OpenAI gateway with recorded/mock server, never real keys in CI

### End-to-end

- register/login
- configure mocked provider credential
- upload CSV
- wait for profile
- create conversation
- ask question
- clarify
- receive chart
- reload and restore history
- delete dataset/account

## 2. Tenant isolation suite

Use Alice/Bob fixtures for every tenant-owned resource. Include guessed UUIDs, list filters, nested routes, queue jobs, vector searches, SSE streams and object URLs. Any leakage fails the build.

## 3. Golden datasets

Include version-controlled synthetic fixtures:

- `sales_clean.csv`
- `sales_dirty.csv`
- `marketing.csv`
- `support_text.csv`
- `ambiguous_revenue.csv`
- `prompt_injection.csv`
- `large_shape_generated` test helper

Do not commit real personal data.

## 4. Agent evaluation dataset

At least 50 cases initially, growing toward 100+, covering:

- overview/schema
- sums/counts/averages
- grouped comparisons
- top/bottom
- date trends and grains
- filters
- missing data
- correlations
- ambiguous terminology
- invalid/non-existent columns
- empty results
- chart selection
- prompt injection
- memory reuse and non-reuse

Each case defines expected plan properties, expected numerical result and acceptable chart types.

## 5. Deterministic evaluators

- exact/approximate numeric equality
- selected column equality
- aggregation/filter correctness
- query result checksum
- chart field existence/type compatibility
- tenant payload filter present
- clarification expected/not expected
- unsupported claim detection by comparing response numbers to result artifact

Use an LLM judge only for language quality or usefulness, never as sole judge of calculations/security.

## 6. Retrieval evaluation

- required source in top K
- irrelevant source ratio
- cross-user leakage must be zero
- correct dataset version
- plan accuracy with versus without retrieved context

## 7. Reliability tests

- duplicate upload confirmation
- duplicate queue delivery
- worker crash/retry
- Redis restart
- provider timeout/rate limit
- SSE reconnect with Last-Event-ID
- cancellation
- database transaction rollback
- encryption key version migration fixture

## 8. CI-equivalent quality gates

- install from lockfile
- formatting/lint
- TypeScript typecheck
- unit tests
- integration tests with service containers
- migration from empty database
- production build
- secret scan
- dependency audit policy
- selected agent eval smoke suite

The repository exposes one local command that runs the applicable gates from the lockfile. Hosted CI
integration is recommended but is not required in the current repository scope; no GitHub Actions
workflow is added unless that scope is explicitly enabled. Full expensive evals may run manually or
on a configured scheduler, but security and core numeric cases remain mandatory release gates.
