# 013 — API, SSE and Queue Contracts

**Status:** Approved for implementation

## 1. API conventions

- JSON APIs under `/api/v1`.
- Zod validation at boundary.
- Authenticated endpoints derive user from session.
- Stable error envelope:

```json
{
  "error": {
    "code": "DATASET_NOT_READY",
    "message": "The dataset is still being prepared.",
    "requestId": "...",
    "details": {}
  }
}
```

Never expose stack traces or provider secret-bearing payloads.

## 2. Account endpoints

Public/session endpoints:

- `GET /api/v1/auth/csrf` — issue/refresh the CSRF token and safe session state
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/email-verification/request`
- `POST /api/v1/auth/email-verification/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

Registration, login and recovery responses must not disclose account existence. Login rotates the
session token. Logout, including an already-expired session, is idempotent. Verification and reset
confirmation consume a single-use token atomically.

Cookie-authenticated mutation contracts require:

- JSON content type and Zod-validated bodies;
- an allowed `Origin`/`Referer` according to the deployment policy;
- a session-bound CSRF token in `X-CSRF-Token`;
- rate limiting before expensive password hashing/provider calls and again by authenticated user where applicable.

Representative bodies are schema-versioned contracts rather than untyped route-local objects:

```ts
type RegisterRequest = { email: string; displayName: string; password: string };
type LoginRequest = { email: string; password: string };
type PasswordResetRequest = { email: string };
type PasswordResetConfirmRequest = { token: string; newPassword: string };
type EmailVerificationConfirmRequest = { token: string };
```

Successful login/registration responses contain a safe user/session summary, never a session token.
The secure session cookie is the only browser credential transport.

- `GET /api/v1/me`
- `PATCH /api/v1/me/profile`
- `POST /api/v1/me/email-change`
- `POST /api/v1/me/password-change`
- `GET /api/v1/me/sessions`
- `DELETE /api/v1/me/sessions/:id`
- `DELETE /api/v1/me` — re-authenticated, idempotently schedules complete account deletion

Collection endpoints use opaque cursor pagination. Mutation endpoints document an idempotency policy;
operations that enqueue work or may be retried by a browser require `Idempotency-Key` or a typed
`clientRequestId`. Ownership failures follow one global disclosure policy and do not reveal whether a
foreign resource exists.

## 3. Provider settings endpoints

- `GET /api/v1/settings/providers/openai`
- `PUT /api/v1/settings/providers/openai/credential`
- `POST /api/v1/settings/providers/openai/validate`
- `DELETE /api/v1/settings/providers/openai/credential`
- `GET /api/v1/settings/providers/openai/models`
- `PUT /api/v1/settings/providers/openai/preferences`

Credential write request contains the key; no credential read response does.

## 4. Dataset endpoints

- `POST /api/v1/datasets/upload-intents`
- `POST /api/v1/datasets/:datasetId/versions/:versionId/complete-upload`
- `GET /api/v1/datasets`
- `GET /api/v1/datasets/:datasetId`
- `GET /api/v1/datasets/:datasetId/versions/:versionId/profile`
- `DELETE /api/v1/datasets/:datasetId`

## 5. Conversation endpoints

- `POST /api/v1/conversations`
- `GET /api/v1/conversations?cursor=...`
- `GET /api/v1/conversations/:conversationId`
- `PATCH /api/v1/conversations/:conversationId`
- `POST /api/v1/conversations/:conversationId/archive`
- `DELETE /api/v1/conversations/:conversationId`
- `POST /api/v1/conversations/:conversationId/messages`
- `POST /api/v1/conversations/:conversationId/runs/:runId/clarifications`
- `POST /api/v1/conversations/:conversationId/runs/:runId/cancel`
- `GET /api/v1/conversations/:conversationId/runs/:runId/events`

## 6. Submit-message contract

```ts
type SubmitMessageRequest = {
  clientRequestId: string;
  content: string;
};

type SubmitMessageResponse = {
  messageId: string;
  runId: string;
  status: "queued";
  eventsUrl: string;
};
```

The active dataset is determined by the conversation record, not trusted from the request body.

## 7. SSE envelope

```ts
type RunEvent = {
  id: string; // monotonic event identifier
  runId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: unknown;
};
```

Each event type has a versioned, Zod-validated payload schema. Unknown future event types may be
ignored by clients, but malformed known events are never published.

Support `Last-Event-ID` for reconnection. Authorize every stream connection against run ownership.

## 8. Queue names and payloads

- `dataset.ingest`
- `dataset.embed`
- `agent.run`
- `conversation.compact`
- `resource.delete`
- `outbox.publish`

All payloads:

- include integer `version`;
- include `jobId`/idempotency key;
- include trusted `userId` and resource IDs;
- are validated before processing;
- avoid provider key plaintext and full CSV data.

Example:

```ts
type AgentRunJobV1 = {
  version: 1;
  jobId: string;
  userId: string;
  conversationId: string;
  runId: string;
};
```

The worker loads all other state from PostgreSQL.

## 9. Domain/integration events

- `UserEmailChanged.v1`
- `ProviderCredentialValidated.v1`
- `DatasetUploadCompleted.v1`
- `DatasetProfiled.v1`
- `DatasetReady.v1`
- `AgentRunStarted.v1`
- `AgentClarificationRequested.v1`
- `AgentRunCompleted.v1`
- `ResourceDeletionRequested.v1`

Events are schema-versioned and published through an outbox when they cross process boundaries.
