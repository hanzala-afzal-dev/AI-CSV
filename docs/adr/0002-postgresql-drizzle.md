# ADR 0002: PostgreSQL with Drizzle ORM

## Status

Accepted.

## Context

The system needs relational persistence for datasets, versions, analysis threads,
messages, and outbox events.

## Decision

Use PostgreSQL with Drizzle ORM and Drizzle Kit migrations.

## Consequences

The schema remains explicit, typed, and migration-friendly. SQL stays close to the
domain data model without introducing decorators into domain code.

## Rejected Alternatives

- Prisma: rejected to keep schema control lightweight and SQL-forward.
- SQLite: rejected because production persistence is PostgreSQL.
