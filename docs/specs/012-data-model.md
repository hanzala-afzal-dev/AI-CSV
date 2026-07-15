# 012 — PostgreSQL Data Model

**Status:** Approved for implementation

## 1. General conventions

- UUIDv7 or ULID identifiers generated server-side.
- `created_at` and `updated_at` use timezone-aware timestamps.
- Tenant-owned tables include indexed `user_id` unless ownership is safely inherited and enforced.
- Use optimistic version columns for aggregates with concurrent mutations.
- Prefer soft archive states for conversations; use hard/queued deletion for privacy deletion.
- Encrypt secrets at application/KMS layer; database extensions alone are not the trust boundary.
- Tenant-crossing references use composite foreign keys or equivalent checked constraints that include
  `user_id`; a valid foreign key to another user's row must be impossible even if application code fails.

## 2. Identity tables

### `users`

- `id`
- `email` unique normalized
- `pending_email` nullable
- `display_name`
- `password_hash`
- `email_verified_at`
- `status`
- timestamps

### `sessions`

- `id`
- `user_id`
- hashed session token/reference
- expiry
- last seen
- user agent/IP metadata with privacy limits
- revoked timestamp

### `verification_tokens` / `password_reset_tokens`

Store token hash, user, purpose and expiry; never plaintext token.

## 3. Provider configuration

### `provider_credentials`

- `id`
- `user_id`
- `provider` (`openai`)
- `ciphertext`
- `nonce`
- `auth_tag` if applicable
- `encrypted_data_key` nullable for KMS envelope mode
- `algorithm`
- `key_version`
- `last4`
- `fingerprint` nullable/keyed
- `status`
- `validated_at`
- timestamps

Unique active credential per user/provider.

### `provider_preferences`

- `user_id`
- `provider`
- `model_id`
- `reasoning_effort`
- `reasoning_mode` nullable
- `model_validated_at`
- timestamps

### `security_audit_events`

- `id`, `user_id`
- event type and outcome
- subject type and nullable subject ID
- request correlation ID
- allow-listed non-secret metadata JSON
- occurred timestamp

Provider credential and preference rows are tenant-owned and use RLS. The application role may select
only safe credential summary columns directly. Encrypted fields are loaded through a dedicated
actor-scoped repository/database function and never through ordinary settings queries. Audit events are
append-only to the application role.

## 4. Dataset tables

### `datasets`

- `id`, `user_id`
- display name
- description nullable
- active version ID nullable
- status
- timestamps/deleted timestamp

### `dataset_versions`

- `id`, `user_id`, `dataset_id`
- version number
- original filename
- MIME/encoding/delimiter
- object key and normalized object key
- bytes/checksum
- lifecycle status and failure code
- row/column counts
- profile version
- timestamps

### `dataset_columns`

- `id`, `user_id`, `dataset_version_id`
- ordinal
- original name and canonical name
- inferred type
- semantic type
- nullable/statistics JSON with schema version
- description nullable

### `dataset_profiles`

- version ID
- typed profile JSON
- warnings JSON
- generated timestamp

## 5. Conversation tables

### `conversations`

- `id`, `user_id`
- title
- active dataset ID/version ID nullable
- status (`active`, `archived`)
- last message sequence/activity
- optimistic version
- timestamps

The Phase 4 MVP hard-deletes a conversation and its dependent chat records after explicit confirmation.
A persisted `deleted` state is added only with a queued privacy-deletion workflow. Active dataset/version
references are added in Phase 5 with composite same-owner foreign keys rather than nullable unguarded IDs.

### `messages`

- `id`, `user_id`, `conversation_id`
- sequence unique per conversation
- role
- status (`streaming`, `final`, `failed`)
- content parts JSON with schema version
- provider response reference nullable
- token/usage metadata without secrets
- timestamps

### `agent_runs`

- `id`, `user_id`, `conversation_id`, `user_message_id`
- dataset/version IDs
- status
- client request ID unique per user
- selected model/reasoning snapshot
- step/repair counts
- failure code/message-safe
- started/completed timestamps

### `agent_checkpoints`

Prefer the official LangGraph PostgreSQL checkpointer schema where compatible. Ensure user/conversation ownership can be joined/enforced and deletion is supported.

### `run_events`

- run ID plus sequence as the primary key
- user and conversation ownership columns for composite referential checks and RLS
- monotonic sequence
- event type
- safe payload JSON
- created timestamp

## 6. Analytical artifacts

### `analysis_plans`

- ID, run/user/dataset version
- schema-versioned structured plan
- plan hash
- validation status

### `analysis_results`

- ID, run/user/dataset version
- result schema
- bounded inline rows or object key
- row count/truncation/execution metrics
- checksum

### `chart_artifacts`

- ID, run/message/user
- result artifact ID
- validated chart spec JSON
- schema version

## 7. Memory and retrieval

### `memories`

As specified in memory spec, including scope, confidence, sources and version binding.

### `knowledge_documents`

- source identity/content hash
- user/dataset/version scope nullable
- document type
- content or object reference
- embedding model/version
- vector point ID
- status

## 8. Operations

### `outbox_events`

- ID, aggregate type/id
- user ID nullable
- event type/version
- payload
- occurred/published timestamps
- attempts/failure

### `background_jobs`

Optional audit mirror of important BullMQ jobs with job type, resource, status and timestamps. Redis remains queue transport, not long-term audit storage.

## 9. Required indexes

- ownership composite indexes: `(user_id, id)` where useful
- conversations `(user_id, last_activity_at desc)`
- messages `(conversation_id, sequence)` unique
- dataset versions `(dataset_id, version_number)` unique
- runs `(conversation_id, created_at)`
- one active run per conversation using a partial unique index over active run statuses
- outbox unpublished partial index
- credential `(user_id, provider)` unique active

Sequence allocation for messages and run events occurs in a transaction that locks the parent row.
RLS policies use the transaction-local actor context and deny access when it is absent or malformed.

## 10. Referential/deletion rules

- User deletion cascades or queues complete deletion of owned data.
- Dataset deletion must not accidentally cascade-delete conversation text; null/reference state is controlled by application workflow.
- Messages/artifacts cascade with conversation deletion.
- Credentials cascade with user deletion.
- Object/vector deletion is coordinated asynchronously and retried.
