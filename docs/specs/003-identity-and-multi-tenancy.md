# 003 — Identity and Multi-Tenancy

**Status:** Approved for implementation

## 1. Tenant model

In version 1, one authenticated user account equals one tenant. Team workspaces are a future extension and must not be implied by current schemas.

## 2. Authentication requirements

- Support email/password registration and login.
- Password hashes use Argon2id with parameters documented and centrally configured.
- Sessions are revocable and persisted.
- Browser authentication uses secure, HTTP-only, same-site cookies.
- CSRF protection is required for cookie-authenticated state-changing endpoints.
- Login responses must not reveal whether a non-existent account differs from a wrong password beyond safe UX constraints.
- Password reset tokens and email-verification tokens are random, single-use, hashed at rest and expire.

Session policy:

- Rotate the session identifier after login, password change and privilege-sensitive re-authentication.
- Enforce configurable idle and absolute expirations; expired or revoked sessions fail closed.
- Persist only a keyed hash of the session token. The plaintext token exists only in the cookie.
- Authenticate SSE requests from the same secure session cookie; never put session tokens in URLs.
- State-changing requests require both an allowed Origin/Referer and a CSRF token bound to the session.
- Registration, login and recovery endpoints use enumeration-safe responses and the rate limits in spec 014.

Argon2id policy for the initial release is centrally configured with a minimum of 19 MiB memory, two
iterations and one degree of parallelism. Deployments may increase these values after measuring their
hardware but may not reduce them below the configured minimum.

Email delivery is an application port. Local development uses a mail catcher or a safe log transport that
never logs usable production tokens; production deployments must configure an SMTP/provider adapter.

## 3. Account changes

### Email

- User submits a new email.
- Current session must be recent or password re-authentication is required.
- A verification message is issued to the new address.
- Canonical email changes only after verification.
- Existing sessions may be preserved or revoked according to a documented policy; sensitive provider credentials remain protected.

### Password

- Requires current password unless initiated through a reset token.
- Successful change revokes other sessions by default.
- The current session may remain after session rotation.

Session revocation policy:

- login replaces and revokes any session presented by that browser;
- password change and password reset revoke every existing session before a replacement is issued;
- requesting an email change rotates the current session but preserves other sessions;
- confirming an email change preserves active sessions because the request already required password
  re-authentication and current-session rotation.

## 4. Authorization policy

Every use case must obtain `AuthenticatedActor` from the verified server session:

```ts
type AuthenticatedActor = {
  userId: string;
  sessionId: string;
};
```

A request body or URL may identify a resource, but it may never define ownership.

Repository methods must express ownership:

```ts
findConversationForUser(conversationId, userId);
findDatasetForUser(datasetId, userId);
```

Avoid unsafe generic methods such as `findById(id)` in tenant-owned repositories.

## 5. Database isolation

Required baseline:

- `user_id` foreign key and indexed ownership columns.
- Unique constraints include `user_id` where names/identifiers are user-local.
- All mutations use ownership predicates.

Required defense in depth:

- PostgreSQL Row-Level Security for tenant-owned tables where practical.
- Set the actor identifier transaction-locally, e.g. `SET LOCAL app.current_user_id`.
- RLS policies deny access when no valid actor context is present.
- Administrative migrations and maintenance roles are separate from application roles.

## 6. Storage and vector isolation

Object key format:

```text
users/{userId}/datasets/{datasetId}/versions/{versionId}/original.csv
users/{userId}/datasets/{datasetId}/versions/{versionId}/normalized.parquet
```

Vector payload minimum:

```json
{
  "userId": "...",
  "datasetId": "...",
  "datasetVersionId": "...",
  "documentType": "column_profile"
}
```

All vector searches must filter by `userId`; dataset questions must additionally filter by active dataset/version.

## 7. Queue isolation

Every tenant-owned job includes `userId` plus resource IDs. A worker must reload the resource through an ownership-scoped repository before processing. Jobs with mismatched ownership fail permanently and produce a security audit event.

## 8. Acceptance scenarios

```gherkin
Scenario: guessed conversation identifier
  Given Alice and Bob are registered users
  And Alice owns conversation C1
  When Bob requests C1 using its exact identifier
  Then the API returns not found or forbidden according to the global disclosure policy
  And no conversation metadata or messages are returned

Scenario: vector isolation
  Given Alice and Bob uploaded datasets with identical column names
  When Alice asks a semantic question
  Then retrieved documents contain only Alice's userId and active datasetId

Scenario: queued ownership revalidation
  Given a queued job contains a datasetId not owned by the embedded userId
  When the worker receives the job
  Then the worker does not open the object
  And records a security-safe failure
```
