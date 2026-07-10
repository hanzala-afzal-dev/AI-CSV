# ADR 0006: Opaque API Keys for the API-First Ownership Boundary

## Status

Accepted for Phase 1.

## Context

CSV upload mutations require a real owner identity before an interactive browser authentication
product has been specified. A static development header or client-supplied owner ID would create a
false security boundary.

## Decision

Use revocable opaque bearer API keys with 256 random bits. Store only an HMAC-SHA-256 digest, key
prefix, owner, expiry, revocation, and usage timestamps. Derive owner scope exclusively from the
authenticated key and require it in every resource query.

## Consequences

CLI and server clients have a real, testable ownership boundary without password storage. Bearer
headers are not ambient browser credentials and reduce CSRF exposure. Keys must be shown only once,
must not be logged, and must not be stored in browser local storage. An interactive browser product
still requires a dedicated OAuth/session ADR and migration path.

## Rejected Alternatives

- Client-supplied owner headers: rejected because they are forgeable.
- Hard-coded development users: rejected because they imply authentication that does not exist.
- Password authentication now: rejected because account recovery, verification, and abuse controls
  are outside the CSV upload scope.
- Browser cookie sessions without an identity provider: rejected as an incomplete security system.
