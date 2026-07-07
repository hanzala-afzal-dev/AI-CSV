#!/usr/bin/env bash
set -euo pipefail

bucket="${S3_BUCKET:-agentic-csv-local}"
awslocal s3 mb "s3://${bucket}" || true
awslocal s3api put-bucket-versioning \
  --bucket "${bucket}" \
  --versioning-configuration Status=Suspended
