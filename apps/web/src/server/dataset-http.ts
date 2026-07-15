import { NextResponse } from "next/server";
import {
  datasetDetailSchema,
  datasetProfileResponseSchema,
  datasetSummarySchema
} from "@agentic-csv/contracts";
import type {
  DatasetDetailView,
  DatasetProfileView,
  DatasetVersionView,
  DatasetView
} from "@agentic-csv/application";

export function datasetResponse(
  data: unknown,
  correlationId: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
) {
  return NextResponse.json({ ok: true, data, correlationId }, { status, headers });
}

export function safeDataset(dataset: DatasetView) {
  return datasetSummarySchema.parse({
    id: dataset.id,
    name: dataset.name,
    originalFilename: dataset.originalFilename,
    status: dataset.status,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    activeVersion: dataset.activeVersion
      ? safeDatasetVersion(dataset.activeVersion)
      : null,
    createdAt: dataset.createdAt.toISOString(),
    updatedAt: dataset.updatedAt.toISOString()
  });
}

export function safeDatasetDetail(dataset: DatasetDetailView) {
  return datasetDetailSchema.parse({
    ...safeDataset(dataset),
    versions: dataset.versions.map(safeDatasetVersion)
  });
}

export function safeDatasetProfile(profile: DatasetProfileView) {
  return datasetProfileResponseSchema.parse(profile);
}

function safeDatasetVersion(version: DatasetVersionView) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    status: version.status,
    failureCode: version.failureCode,
    rowCount: version.rowCount,
    columnCount: version.columnCount,
    profileVersion: version.profileVersion,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}
