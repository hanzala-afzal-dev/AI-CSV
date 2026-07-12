# 006 — CSV Datasets and Ingestion

**Status:** Approved for implementation

## 1. Scope

Only CSV files are accepted in the MVP. A dataset is logical user-owned data; a dataset version represents one uploaded file.

## 2. Upload flow

Preferred production flow:

1. Authenticated client requests an upload intent.
2. Server validates declared file metadata and creates a pending dataset/version.
3. Server returns a short-lived presigned S3-compatible upload URL and constrained object key.
4. Client uploads directly to object storage.
5. Client confirms completion.
6. Server verifies object existence/size and enqueues `dataset.ingest.v1`.
7. Worker validates, profiles and marks the version ready or failed.

A server-proxied upload is acceptable only for a documented small-file development path.

## 3. Validation

- Extension must be `.csv`, but extension is not sufficient.
- Inspect content signature, delimiter and encoding.
- Reject binary/non-text content.
- Configurable maximum bytes and rows.
- Limit columns and maximum field length.
- Detect malformed row ratios and fail or warn according to thresholds.
- Formula strings are treated as data; no spreadsheet execution occurs.
- CSV cells are never interpreted as agent instructions.

## 4. Lifecycle

```text
pending_upload
-> uploaded
-> queued
-> validating
-> profiling
-> indexing
-> ready

Failure from any processing state -> failed
Deletion -> deleting -> deleted
```

Every transition is guarded by the `DatasetVersion` aggregate and is idempotent.

## 5. Profiling output

Persist:

- row count
- column count
- delimiter and encoding
- inferred column types
- null count/percentage
- distinct count estimate
- min/max and basic numeric statistics
- example values with sensitive logging restrictions
- candidate date, numeric, categorical, identifier and free-text classifications
- parse warnings
- profile version

## 6. Analytical representation

- Keep original CSV immutable.
- The worker may create normalized Parquet for faster and safer repeat analysis.
- Record a content checksum and normalized artifact checksum.
- DuckDB opens only the authorized object or a controlled local temporary copy.
- Temporary files use randomized paths and are deleted after processing.

## 7. Dataset association

- A dataset may be referenced by multiple conversations owned by the same user.
- One conversation has one active dataset version in MVP.
- Replacing the file creates a new version rather than mutating the original.
- Existing analytical messages retain the version used for their result.

## 8. Queue job

```ts
type DatasetIngestJobV1 = {
  version: 1;
  jobId: string;
  userId: string;
  datasetId: string;
  datasetVersionId: string;
  objectKey: string;
  checksum?: string;
  requestedAt: string;
};
```

Worker rules:

- Validate with Zod.
- Re-check ownership and current lifecycle.
- Acquire an idempotency lock.
- Update persisted progress.
- Retry transient storage/database failures with bounded exponential backoff.
- Do not retry permanent parsing/validation failures.

## 9. Deletion

Deleting a dataset schedules deletion of:

- original and normalized objects
- profile/statistics
- vector points for all versions
- dataset-scoped memories
- cached query outputs

Deletion must be idempotent and auditable without retaining row contents.

## 10. Acceptance scenarios

```gherkin
Scenario: valid CSV ingestion
  Given an authenticated user uploads a valid CSV
  When ingestion finishes
  Then the dataset version is ready
  And schema/profile metadata is persisted
  And suggested prompts can be generated

Scenario: non-CSV renamed as CSV
  Given a binary file named data.csv
  When ingestion validates content
  Then the version fails with DATASET_INVALID_FILE
  And no embeddings or analytical artifacts are created

Scenario: object path isolation
  Given Alice uploads a CSV
  Then its object key begins with users/{Alice.userId}/
  And Bob cannot obtain a presigned read or write URL for that object
```
