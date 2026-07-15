#!/usr/bin/env bash
set -euo pipefail

bucket="${S3_BUCKET:-agentic-csv-local}"
app_url="${APP_URL:-http://localhost:3000}"
awslocal s3 mb "s3://${bucket}" || true
awslocal s3api put-bucket-versioning \
  --bucket "${bucket}" \
  --versioning-configuration Status=Suspended

cors_file="$(mktemp)"
trap 'rm -f "${cors_file}"' EXIT
cat >"${cors_file}" <<JSON
{
  "CORSRules": [
    {
      "AllowedOrigins": ["${app_url}"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
      "MaxAgeSeconds": 900
    }
  ]
}
JSON
awslocal s3api put-bucket-cors \
  --bucket "${bucket}" \
  --cors-configuration "file://${cors_file}"
