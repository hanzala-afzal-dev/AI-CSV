import {
  datasetDetailSchema,
  datasetListResponseSchema,
  datasetProfileResponseSchema,
  datasetSummarySchema,
  uploadCompletionResponseSchema,
  uploadIntentResponseSchema,
  type DatasetDetailContract,
  type DatasetListResponseContract,
  type DatasetProfileResponseContract,
  type DatasetSummaryContract,
  type UploadCompletionResponse,
  type UploadIntentResponse
} from "@agentic-csv/contracts";
import { authenticatedMutation, authenticatedQuery } from "@/features/identity/api";

interface Envelope<T> {
  readonly data: T;
}

export async function listDatasets(): Promise<DatasetListResponseContract> {
  const response = await authenticatedQuery<Envelope<unknown>>(
    "/api/v1/datasets?limit=30"
  );
  return datasetListResponseSchema.parse(response.data);
}

export async function createDataset(file: File): Promise<DatasetSummaryContract> {
  const response = await authenticatedMutation<Envelope<{ readonly dataset: unknown }>>(
    "/api/v1/datasets",
    "POST",
    {
      name: datasetNameFromFilename(file.name),
      originalFilename: file.name
    }
  );
  return datasetSummarySchema.parse(response.data.dataset);
}

export async function createUploadIntent(
  datasetId: string,
  file: File,
  checksumSha256: string
): Promise<UploadIntentResponse> {
  const response = await authenticatedMutation<Envelope<unknown>>(
    `/api/v1/datasets/${datasetId}/upload`,
    "POST",
    {
      contentType: csvContentType(file),
      sizeBytes: file.size,
      checksumSha256
    }
  );
  return uploadIntentResponseSchema.parse(response.data);
}

export async function completeUpload(
  datasetId: string,
  uploadIntentId: string
): Promise<UploadCompletionResponse> {
  const response = await authenticatedMutation<Envelope<unknown>>(
    `/api/v1/datasets/${datasetId}/upload/complete`,
    "POST",
    { uploadIntentId },
    { "idempotency-key": crypto.randomUUID() }
  );
  return uploadCompletionResponseSchema.parse(response.data);
}

export async function getDataset(datasetId: string): Promise<DatasetDetailContract> {
  const response = await authenticatedQuery<Envelope<{ readonly dataset: unknown }>>(
    `/api/v1/datasets/${datasetId}`
  );
  return datasetDetailSchema.parse(response.data.dataset);
}

export async function getDatasetProfile(
  datasetId: string,
  datasetVersionId: string
): Promise<DatasetProfileResponseContract> {
  const response = await authenticatedQuery<Envelope<unknown>>(
    `/api/v1/datasets/${datasetId}/versions/${datasetVersionId}/profile`
  );
  return datasetProfileResponseSchema.parse(response.data);
}

export async function sha256Base64(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function uploadToSignedUrl(
  intent: UploadIntentResponse,
  file: File,
  onProgress: (percentage: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(intent.method, intent.uploadUrl);
    for (const [name, value] of Object.entries(intent.requiredHeaders)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(new Error("The CSV upload could not reach storage."));
    request.onabort = () => reject(new Error("The CSV upload was cancelled."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error("Storage rejected the CSV upload."));
      }
    };
    request.send(file);
  });
}

function csvContentType(file: File): "text/csv" | "application/csv" | "text/plain" {
  if (file.type === "application/csv" || file.type === "text/plain") return file.type;
  return "text/csv";
}

function datasetNameFromFilename(filename: string): string {
  const value = filename
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return value.slice(0, 120) || "CSV dataset";
}
