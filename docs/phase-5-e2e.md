# Phase 5 end-to-end verification

These checks exercise the real browser, PostgreSQL, Redis/BullMQ, LocalStack S3, worker, and DuckDB
profile path. Playwright is intentionally not required yet.

## 1. One-time upgrade

Merge the Phase 5 variables from `.env.example` into the root `.env`, preserving existing secrets:

```dotenv
CSV_MAX_ROWS=1000000
CSV_MAX_COLUMNS=500
CSV_MAX_FIELD_CHARACTERS=1000000
CSV_MAX_MALFORMED_ROW_RATIO=0
CSV_PROFILE_TIMEOUT_MS=60000
DUCKDB_MEMORY_LIMIT_MB=512
INGESTION_CLAIM_TTL_SECONDS=300
RATE_LIMIT_UPLOAD_INTENT_MAX_REQUESTS=10
RATE_LIMIT_UPLOAD_COMPLETION_MAX_REQUESTS=20
```

Existing local Compose files should also pass `APP_URL` to `localstack`, as shown in
`docker/docker-compose.yml.example`. Validate and reconcile the environment:

```bash
pnpm env:check
pnpm docker:config
docker compose --env-file .env -f docker/compose.yaml --profile app build worker
pnpm docker:up
pnpm docker:ps
```

The targeted worker build is needed once for this upgrade because Phase 5 adds the native DuckDB worker
entry point. It does not rebuild the web image. Afterward, source changes are picked up by the existing
watch containers. Normal daily use remains:

```bash
pnpm docker:stop
pnpm docker:start
```

Use `pnpm docker:up`, without `--build`, when environment or Compose configuration changes. Do not run
`pnpm docker:reset`; it deletes local data.

## 2. Happy path

1. Open `http://localhost:3000`. Mailpit is available at `http://localhost:8026` when a new account needs
   email verification.
2. Sign in, finish OpenAI settings if the composer reports that configuration is incomplete, and open
   **New conversation**.
3. Select `tests/fixtures/csv/sales_clean.csv` from the CSV attachment control.
4. Confirm that the panel moves through upload/queued/profile states and reaches **Ready**. Processing is
   asynchronous, so fast fixtures may pass intermediate states quickly.
5. Confirm the persisted profile reports **10 rows**, **7 columns**, detected column names, and 3-6 prompt
   suggestions.
6. Open another conversation and return, then reload the browser. The same dataset version and ready
   profile must be restored without uploading again.
7. Select the overview suggestion and send it. In Phase 5 the deterministic response confirms the
   dataset name, row/column counts, and schema. Numerical analysis and charts start in Phase 6.

Keep `pnpm docker:logs` open in another terminal if status does not advance. Logs may contain IDs and safe
failure codes, but must not contain CSV rows or signed URLs.

## 3. Validation and retry

1. In a new conversation, upload `tests/fixtures/csv/sales_dirty.csv`.
2. Confirm the version reaches **Failed** with a safe malformed-CSV message, not a stack trace or raw row.
3. Use **Retry**, choose `sales_clean.csv`, and confirm the new immutable version reaches **Ready**.
4. Create an obvious binary file and upload it through a new conversation:

   ```bash
   printf '\x00\x01\x02not-a-csv' > /tmp/not-really.csv
   ```

   It must fail safely as an invalid file.

5. Upload `tests/fixtures/csv/prompt_injection.csv`. It must profile as ordinary data; hostile-looking cell
   text and spreadsheet formulas must not trigger commands, HTML, tools, or dataset changes.

## 4. Tenant isolation

1. Keep Alice signed in in the normal browser window and note her dataset ID from the dataset detail
   request in browser developer tools.
2. Open a private window, register and verify Bob, then sign in as Bob.
3. Bob's dataset list must not show Alice's dataset.
4. From Bob's developer console, request Alice's ID:

   ```js
   fetch("/api/v1/datasets/ALICE_DATASET_ID", { credentials: "include" }).then(
     async (response) => [response.status, await response.json()]
   );
   ```

   The result must be the same safe `404 DATASET_NOT_FOUND` used for a missing ID. Dataset list/detail/
   profile responses must not expose `userId`, storage object keys, or persistent storage URLs.

Database-level Alice/Bob isolation, composite ownership constraints, upload idempotency, and worker claim
behavior are covered by the automated integration suite:

```bash
pnpm quality
pnpm test:integration
pnpm docker:config
pnpm docker:ps
```

The E2E pass is complete when the happy path, invalid/retry path, reload behavior, and Alice/Bob check all
pass while `web`, `worker`, PostgreSQL, Redis, and LocalStack remain healthy.
