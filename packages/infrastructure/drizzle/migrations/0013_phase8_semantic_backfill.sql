CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
WITH source_documents AS (
  SELECT
    dp.user_id,
    dp.dataset_id,
    dp.dataset_version_id,
    left(
      jsonb_build_object(
        'kind', 'dataset_description',
        'name', d.name,
        'rowCount', dv.row_count,
        'columnCount', dv.column_count,
        'encoding', dv.encoding,
        'delimiter', dv.delimiter,
        'columns', coalesce(
          jsonb_agg(dc.canonical_name ORDER BY dc.ordinal)
            FILTER (WHERE dc.id IS NOT NULL),
          '[]'::jsonb
        )
      )::text,
      4000
    ) AS content
  FROM dataset_profiles dp
  JOIN dataset_versions dv
    ON dv.user_id = dp.user_id
   AND dv.dataset_id = dp.dataset_id
   AND dv.id = dp.dataset_version_id
  JOIN datasets d
    ON d.user_id = dp.user_id
   AND d.id = dp.dataset_id
  LEFT JOIN dataset_columns dc
    ON dc.user_id = dp.user_id
   AND dc.dataset_id = dp.dataset_id
   AND dc.dataset_version_id = dp.dataset_version_id
  GROUP BY
    dp.user_id,
    dp.dataset_id,
    dp.dataset_version_id,
    d.name,
    dv.row_count,
    dv.column_count,
    dv.encoding,
    dv.delimiter
)
INSERT INTO semantic_documents (
  user_id,
  dataset_id,
  dataset_version_id,
  source_id,
  document_type,
  content,
  content_hash,
  schema_version,
  index_status
)
SELECT
  user_id,
  dataset_id,
  dataset_version_id,
  dataset_version_id,
  'dataset_description',
  content,
  encode(digest(content, 'sha256'), 'hex'),
  1,
  'pending'
FROM source_documents
ON CONFLICT (user_id, dataset_version_id, document_type, source_id) DO NOTHING;
--> statement-breakpoint
WITH source_documents AS (
  SELECT
    dc.user_id,
    dc.dataset_id,
    dc.dataset_version_id,
    dc.id AS source_id,
    left(
      jsonb_build_object(
        'kind', 'column_profile',
        'datasetName', d.name,
        'originalName', dc.original_name,
        'canonicalName', dc.canonical_name,
        'inferredType', dc.inferred_type,
        'semanticType', dc.semantic_type,
        'nullable', dc.nullable,
        'nullCount', dc.statistics->'nullCount',
        'nullPercentage', dc.statistics->'nullPercentage',
        'distinctCount', dc.statistics->'distinctCount'
      )::text,
      4000
    ) AS content
  FROM dataset_columns dc
  JOIN datasets d
    ON d.user_id = dc.user_id
   AND d.id = dc.dataset_id
)
INSERT INTO semantic_documents (
  user_id,
  dataset_id,
  dataset_version_id,
  source_id,
  document_type,
  content,
  content_hash,
  schema_version,
  index_status
)
SELECT
  user_id,
  dataset_id,
  dataset_version_id,
  source_id,
  'column_profile',
  content,
  encode(digest(content, 'sha256'), 'hex'),
  1,
  'pending'
FROM source_documents
ON CONFLICT (user_id, dataset_version_id, document_type, source_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO memory_context_heads (
  user_id,
  dataset_id,
  dataset_version_id,
  revision,
  updated_at
)
SELECT
  user_id,
  dataset_id,
  dataset_version_id,
  0,
  now()
FROM dataset_profiles
ON CONFLICT (user_id, dataset_id, dataset_version_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO outbox_events (
  user_id,
  aggregate_id,
  event_name,
  payload,
  occurred_at
)
SELECT
  dp.user_id,
  dp.dataset_version_id,
  'queue.knowledge.index.v1',
  jsonb_build_object(
    'version', 1,
    'jobName', 'knowledge.index.v1',
    'correlationId', dp.dataset_version_id::text,
    'userId', dp.user_id::text,
    'idempotencyKey', 'dataset-schema:' || dp.dataset_version_id::text || ':v' || coalesce(dp.profile->>'version', '1'),
    'source', 'dataset-schema',
    'datasetId', dp.dataset_id::text,
    'datasetVersionId', dp.dataset_version_id::text
  ),
  now()
FROM dataset_profiles dp
WHERE EXISTS (
  SELECT 1
  FROM semantic_documents sd
  WHERE sd.user_id = dp.user_id
    AND sd.dataset_id = dp.dataset_id
    AND sd.dataset_version_id = dp.dataset_version_id
    AND sd.index_status IN ('pending', 'failed')
)
AND NOT EXISTS (
  SELECT 1
  FROM outbox_events oe
  WHERE oe.user_id = dp.user_id
    AND oe.aggregate_id = dp.dataset_version_id
    AND oe.event_name = 'queue.knowledge.index.v1'
    AND oe.payload->>'idempotencyKey' =
      'dataset-schema:' || dp.dataset_version_id::text || ':v' || coalesce(dp.profile->>'version', '1')
);
