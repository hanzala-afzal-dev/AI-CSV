# Engineering Constitution

## Principles

1. Correctness before autonomy.
2. Specification before implementation.
3. Explicit architecture boundaries.
4. Type safety at boundaries.
5. Secure by default.
6. Asynchronous reliability.
7. Observability and operations.
8. Test the seams.
9. Small, reviewable increments.
10. Documentation is part of the product.

## Operating Rules

The LLM plans and explains. Deterministic tools calculate. RAG retrieves semantic
context. Every feature must preserve that division of responsibility.

Domain code is framework-neutral. Application code depends on domain concepts and
ports. Infrastructure implements ports. Web and worker processes compose concrete
dependencies and expose delivery mechanisms.

Long-running work belongs in queues. Request handlers may validate intent and enqueue
commands, but they must not run ingestion, embedding, profiling, or analytical jobs.

External input is untrusted. Boundary data must be validated with Zod before it reaches
application handlers, workers, or agent graph state.
