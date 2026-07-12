# 010 — RAG and Knowledge Base

**Status:** Approved for implementation

## 1. Purpose

RAG helps the agent understand terminology, schema meaning, user-confirmed business rules, textual data and validated prior findings. Structured calculations remain in DuckDB.

## 2. Documents eligible for embedding

- dataset description
- column profiles and semantic descriptions
- user glossary/business rules
- free-text field chunks where configured
- verified insights with result references
- curated application help and analytical examples

Do not embed raw secrets, passwords, provider keys or unrestricted PII.

## 3. Vector payload

```ts
type VectorPayload = {
  userId: string;
  datasetId?: string;
  datasetVersionId?: string;
  conversationId?: string;
  documentType:
    | "dataset_description"
    | "column_profile"
    | "business_rule"
    | "text_chunk"
    | "validated_insight"
    | "app_help";
  sourceId: string;
  contentHash: string;
  schemaVersion: number;
};
```

## 4. Retrieval

- Mandatory filter by `userId` for private documents.
- Dataset questions filter by active dataset and compatible version.
- Global app-help documents use a distinct public namespace and cannot contain user data.
- Use top-K, score thresholds and optional keyword/hybrid retrieval.
- Reranking is a later optimization and must be evaluated.
- Retrieval results include source identifiers for traceability.

## 5. Ingestion

- Embedding occurs in a worker queue after profile creation.
- Jobs are idempotent by source content hash and embedding model version.
- Re-index when semantic source or embedding model changes.
- Delete stale points when a version/dataset/user is deleted.

## 6. Version-controlled knowledge-base folder

Required structure:

```text
knowledge-base/
  README.md
  policies/
    analytical-safety.md
    tenant-isolation.md
    prompt-injection.md
    chart-selection.md
  glossary/
    analytics.md
    product.md
  prompts/
    system/
    planning/
    explanation/
    suggestions/
  examples/
    analysis-plans/
    chart-specs/
    clarifications/
  evals/
    golden-questions.jsonl
```

Rules:

- Files are reviewed like code.
- Prompt files include version and expected structured output schema.
- Runtime loads only allow-listed paths.
- User CSV content cannot override knowledge-base policies.
- Changes to policies/prompts require agent evaluation.

## 7. RAG evaluation

Measure:

- recall of required business rule/column description
- precision of retrieved context
- cross-tenant leakage rate (must be zero)
- version correctness
- impact on plan accuracy
- unsupported citation rate

## 8. Acceptance scenarios

```gherkin
Scenario: business rule retrieval
  Given a confirmed rule says cancelled orders are excluded from revenue
  When the user asks for revenue
  Then retrieval supplies the rule
  And the plan applies the exclusion
  And the final answer discloses it

Scenario: embeddings are not used as calculator
  Given a numeric sales CSV
  When the user asks for total revenue
  Then the total is produced by an analytical query
  And vector similarity scores are not used to calculate it
```
