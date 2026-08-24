# Phase 9 release verification

Phase 9 has one local release-equivalent command:

    pnpm release:check

It installs from the frozen lockfile, scans secrets, verifies dependency policy, runs formatting,
architecture, lint, TypeScript, unit/API tests and production builds, runs PostgreSQL integration/RLS
tests, migrates a generated empty database, regenerates the deterministic 50-case evaluation report,
and performs the production dependency audit. The migration check creates and drops only a temporary
database in the configured local PostgreSQL instance.

Normal Docker startup remains non-rebuilding:

    pnpm docker:start

Use pnpm docker:up only when containers do not exist yet. Rebuild the web/worker images only after
dependency or container-definition changes:

    pnpm docker:up:build

## Optional real-provider smoke

Automated tests never use a real provider key. For a manual smoke:

1. Start the existing stack and open the application.
2. Register or sign in, then add the OpenAI key through Settings. Do not put the key in fixture files,
   test code or committed environment files.
3. Upload tests/fixtures/csv/sales_clean.csv.
4. Ask for total revenue, revenue by region and a monthly revenue trend. Confirm the numeric values
   match docs/evaluation/phase-9-report.md, a chart has a data table, and reload preserves history.
5. Click a follow-up suggestion and verify it submits the exact visible prompt through the normal
   composer and reconnects after an interrupted stream.
6. Delete the dataset from its panel, confirm it disappears after the worker completes, then test
   account deletion only with a disposable local account.
