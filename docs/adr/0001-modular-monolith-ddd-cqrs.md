# ADR 0001: Modular Monolith with DDD and Logical CQRS

## Status

Accepted.

## Context

The product needs clear business boundaries without the operational overhead of early
microservices.

## Decision

Use a modular monolith with separate web and worker processes. Apply DDD package
boundaries and logical CQRS inside the application package.

## Consequences

Business rules remain testable and infrastructure-free. Deployment stays simple while
allowing workers to scale independently from web requests.

## Rejected Alternatives

- Microservices: rejected because this phase does not need distributed ownership.
- Event sourcing: rejected because lifecycle audit needs are handled by domain events
  and an outbox-ready schema.
