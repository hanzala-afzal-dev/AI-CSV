# 021 - Phase 8 RAG and Memory Execution Contract

**Status:** Implemented

## 1. Goal

Deliver one complete vertical slice in which an explicitly confirmed dataset definition is persisted,
indexed, retrieved into the Phase 7 graph, applied to a deterministic plan and disclosed to the user.
Numeric calculations remain in DuckDB. Do not add autonomous long-term memory extraction.

## 2. Storage ownership

- PostgreSQL is authoritative for memories, knowledge-document lifecycle and deletion state.
- Qdrant stores derived vectors only. Every private point carries `userId`, `datasetId`,
  `datasetVersionId`, document type, source ID, content hash and schema version.
- Private retrieval must supply a non-empty trusted `userId` filter plus the active dataset and compatible
  version filter. The Qdrant adapter rejects calls missing those filters.
- Composite foreign keys, forced RLS and narrow application-role grants apply to every new tenant table.
- A point ID is server-generated and cannot be accepted from a browser or model response.

## 3. Embedding boundary

- Use the authenticated user's encrypted OpenAI credential through the existing opaque secret boundary.
- Use `OPENAI_EMBEDDING_MODEL` and `QDRANT_VECTOR_SIZE`; do not reuse the selected chat model as an
  embedding model.
- Embed only bounded semantic documents and confirmed definitions, never provider secrets, object keys,
  signed URLs, raw unrestricted CSV rows or hidden personal traits.
- Reviewed safety policies are loaded directly from allow-listed `knowledge-base/` paths. They are not
  copied into each user's private vector namespace.
- Index jobs are idempotent by source ID, content hash, embedding model and schema version.

## 4. Memory creation

- A clarification answer remains conversation-only by default.
- The user must explicitly choose to save it as a reusable dataset definition.
- The saved record has `confidence: confirmed`, source message IDs and dataset/version binding.
- Model-inferred candidates may be shown later but cannot silently become confirmed memory in Phase 8.
- Updating a definition creates a new content hash and replaces the derived point idempotently.

## 5. Retrieval and graph use

- The existing `retrieve_semantic_context` graph step calls one typed application port.
- Retrieval is bounded by top-K, score threshold, document types and a deterministic token/character budget.
- Retrieved text is untrusted evidence, structurally separate from system policy, with source IDs retained.
- A confirmed definition may resolve a plan ambiguity only when its dataset/version scope is compatible.
- The final response discloses any remembered definition that changed or constrained the plan.
- Similarity scores and embeddings are never used to calculate totals, trends, correlations or chart values.

## 6. Version and deletion rules

- Version-specific column semantics do not apply to a different dataset version unless explicitly marked
  lineage-compatible and revalidated against the active schema.
- Conversation deletion removes conversation memories and queues their vector deletion.
- Dataset deletion removes dataset documents, definitions, validated insights and points.
- User deletion covers all PostgreSQL records and Qdrant points. Failed vector deletion remains retryable
  from durable outbox state and does not become an untracked orphan.

## 7. Required verification

- Confirmed `revenue = net_revenue` improves the next plan and is disclosed.
- A one-time clarification without explicit save is not retrieved in a new conversation.
- Alice cannot retrieve Bob's points even when source IDs, dataset IDs or text are guessed.
- V1 definitions do not affect incompatible V2 analysis.
- Missing tenant filters fail before a Qdrant request is issued.
- Repeated indexing produces one current point per source/model/hash.
- Prompt-like text in a document remains quoted untrusted context and cannot change tools or ownership.
- PostgreSQL deletion plus outbox processing removes the corresponding Qdrant derivatives.

## 8. Definition of done

Phase 8 is implemented when the confirmed-definition scenario works after reload, PostgreSQL and Qdrant
isolation/version tests show zero leakage, indexing/deletion are idempotent, the graph exposes sources and
applied rules, and the full local quality/integration/runtime checks pass.
