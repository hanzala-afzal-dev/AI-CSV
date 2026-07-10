# 005 — Conversation and Chat Persistence

**Status:** Approved for implementation

## 1. Conversation lifecycle

A user can:

- Create a new conversation.
- List recent conversations ordered by last activity.
- Open a prior conversation.
- Rename manually.
- Receive an automatically generated title after the first meaningful exchange.
- Archive/unarchive.
- Delete with confirmation.

A conversation belongs to exactly one user and has at most one active dataset in the MVP.

## 2. Empty conversation behavior

- A new conversation displays a CSV upload call to action.
- The prompt composer may accept non-analysis questions such as “what can this app do?”, but dataset analysis is disabled until ingestion is ready.
- After upload, the active dataset badge appears in the header/composer area.
- The assistant may post a system-generated dataset summary and suggested prompts after profiling.

## 3. Message model

Message roles:

- `user`
- `assistant`
- `system_event` for visible status cards only
- `tool` is persisted for traceability but not rendered as a normal message by default

Message content is immutable after finalization. Streaming uses message parts/events and then finalizes a canonical message.

Content parts may include:

- text
- clarification request
- chart artifact reference
- result-table reference
- provenance reference
- warning
- status

## 4. Agent run lifecycle

Each submitted user message creates one `agent_run`:

```text
queued -> running -> waiting_for_user -> running -> completed
                         |                 |
                         +-> cancelled     +-> failed
```

- `waiting_for_user` persists the LangGraph interrupt/checkpoint.
- User clarification resumes the same run or creates a linked continuation according to the graph adapter; the UI treats it as one analytical workflow.
- Runs are idempotent by client request ID.
- A refresh reconstructs current state from PostgreSQL and resumes event delivery.

## 5. Streaming

Use Server-Sent Events by default for one-way run events. WebSocket is optional and requires an ADR.

Event examples:

- `run.queued`
- `run.started`
- `node.started`
- `assistant.delta`
- `clarification.requested`
- `chart.ready`
- `run.completed`
- `run.failed`

SSE is a delivery channel, not the source of truth. Important events/messages are persisted first or transactionally coordinated through an outbox.

## 6. Ordering and concurrency

- Messages use a monotonic per-conversation sequence number.
- Only one mutating agent run may be active per conversation in the MVP.
- Enforce the active-run invariant with a PostgreSQL partial unique index or an equivalent
  transactionally acquired lock; an application-only preflight check is insufficient.
- A second prompt while a run is active is rejected with `CONVERSATION_RUN_ACTIVE` or queued according to an explicit future feature.
- The user may cancel a running run.
- Allocate message and run-event sequence numbers transactionally while locking the owning
  conversation/run row so concurrent requests cannot produce duplicate or reordered sequences.

## 7. Conversation deletion

Deletion removes or schedules removal of:

- messages
- runs and checkpoints
- chart/result artifacts
- conversation memories

It does not automatically delete the dataset if that dataset is referenced by another conversation. Deleting a dataset must make dependent conversations show a deleted-dataset state while preserving chat text until the user deletes the conversation.

## 8. Acceptance scenarios

```gherkin
Scenario: conversation survives reload
  Given a user completed a CSV analysis conversation
  When the user signs out and returns later
  Then the conversation appears in the sidebar
  And all finalized messages and charts are available

Scenario: clarification survives reload
  Given an agent run is waiting for clarification
  When the browser reloads
  Then the clarification question is still visible
  And the user's answer resumes the persisted workflow

Scenario: concurrent prompt protection
  Given a conversation has a running agent run
  When the user submits another prompt
  Then the API returns CONVERSATION_RUN_ACTIVE
  And no duplicate analytical execution starts
```
