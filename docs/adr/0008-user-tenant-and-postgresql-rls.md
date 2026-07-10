# ADR 0008: User Tenant Boundary and PostgreSQL RLS

## Status

Accepted.

## Context

The API-first upload slice used an `owners` table and bearer keys. The product contract now defines
one authenticated user as the version 1 tenant and requires defense-in-depth database isolation.
Application predicates alone do not protect against a future unscoped repository query.

## Decision

- Rename `owners` to `users` and all current ownership columns to `user_id` with an additive migration.
- Preserve hashed bearer keys as transitional personal access credentials for CLI/server use.
- Use a separate schema-owning migration connection and non-owner `agentic_csv_app` runtime role.
- Force RLS on implemented tenant tables and deny rows when `app.current_user_id` is absent.
- Set `app.current_user_id` transaction-locally in the application unit of work.
- Implement email/password browser sessions in Phase 2; browser code never persists bearer keys.

## Consequences

Existing rows migrate without destructive replacement. Clean Docker volumes initialize the runtime
role automatically; older local volumes require an intentional reset or equivalent manual role setup.
Every tenant use case must execute inside an actor-scoped transaction. Authentication lookup remains a
dedicated pre-tenant operation and cannot be used to read tenant resources.
