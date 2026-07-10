# 009 — Memory and Context Management

**Status:** Approved for implementation

## 1. Memory layers

### Working state

LangGraph state for the active run. Persisted through a checkpointer and scoped to `conversationId`/`runId`.

### Conversation memory

Recent messages plus a compact summary for older turns. Used only within the same conversation.

### Dataset memory

Validated semantic facts and user-confirmed definitions tied to one dataset version or dataset lineage.

Examples:

- “Use net_revenue when the user says revenue.”
- “Cancelled orders should be excluded.”

### User preference memory

Non-sensitive durable preferences, such as preferred chart style or whether provenance panels default open. Never store API key content, passwords or inferred sensitive personal traits.

## 2. Memory creation rules

- Do not treat every message as durable memory.
- Candidate memory is extracted after a turn and must be typed.
- User-confirmed business definitions can be stored with confidence `confirmed`.
- Model-inferred facts are `provisional` and cannot silently control future calculations without disclosure.
- Calculated insights include dataset version and result artifact reference.

## 3. Memory schema

```ts
type MemoryRecord = {
  id: string;
  userId: string;
  scope: "conversation" | "dataset" | "user_preference";
  conversationId?: string;
  datasetId?: string;
  datasetVersionId?: string;
  kind: "summary" | "definition" | "preference" | "validated_insight";
  content: string;
  confidence: "provisional" | "confirmed" | "verified";
  sourceMessageIds: string[];
  expiresAt?: string;
  createdAt: string;
};
```

## 4. Context assembly order

1. System and safety policy from version-controlled knowledge base.
2. Active user/model configuration.
3. Authorized dataset profile and schema.
4. Relevant confirmed dataset memories.
5. Retrieved semantic context.
6. Conversation summary.
7. Recent message window.
8. Current question.

Apply token budgeting and deterministic truncation. Never drop tenant/security policy to fit more conversation content.

## 5. Compaction

- Trigger after configurable token/message thresholds.
- Run asynchronously when possible.
- Persist summary with covered message range and version.
- Never delete original finalized messages solely because a summary exists.
- Summary generation is idempotent and can be regenerated.

## 6. Clarification memory

A clarification answer becomes part of:

- the active analysis plan;
- the conversation timeline;
- optionally a dataset definition when the user explicitly confirms a reusable rule.

Do not assume a one-time clarification is globally permanent.

## 7. Deletion and privacy

- Conversation deletion removes conversation memories and vector points.
- Dataset deletion removes dataset memories and validated insights.
- User deletion removes all memory scopes.
- Users can inspect and delete durable preference/definition memories in a future settings UI; schema must support it now.

## 8. Acceptance scenarios

```gherkin
Scenario: clarification is remembered in the conversation
  Given the user clarified that revenue means net_revenue
  When the user later asks "compare revenue by country" in the same conversation
  Then the agent may use net_revenue
  And discloses the remembered definition

Scenario: no cross-conversation assumption
  Given the user made a one-time clarification without saving it as a dataset rule
  When a new conversation starts
  Then the agent does not silently reuse that clarification

Scenario: dataset version safety
  Given a validated insight belongs to version V1
  When version V2 becomes active
  Then the insight is not treated as current unless revalidated
```
