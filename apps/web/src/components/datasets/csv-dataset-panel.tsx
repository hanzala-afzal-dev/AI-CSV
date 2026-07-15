"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Upload
} from "lucide-react";
import type {
  DatasetDetailContract,
  DatasetProfileContract,
  DatasetVersionStatusContract
} from "@agentic-csv/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatasetProfileSummary } from "./dataset-profile-summary";

export function CsvDatasetPanel({
  dataset,
  profile,
  maxBytes,
  uploadProgress,
  busy,
  error,
  compact = false,
  onChoose,
  onFile,
  onSuggestion
}: {
  readonly dataset: DatasetDetailContract | null;
  readonly profile: DatasetProfileContract | null;
  readonly maxBytes: number;
  readonly uploadProgress: number | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly compact?: boolean;
  readonly onChoose: () => void;
  readonly onFile: (file: File) => void;
  readonly onSuggestion: (suggestion: string) => void;
}) {
  const version = dataset?.activeVersion ?? null;
  const status = version?.status ?? null;
  const failed = status === "failed";
  const ready = status === "ready" && profile !== null;

  return (
    <section
      className={cn("csv-dataset-panel", compact && "csv-dataset-panel-compact")}
      aria-live="polite"
      onDragOver={(event) => {
        if (busy) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (busy) return;
        const file = event.dataTransfer.files.item(0);
        if (file) onFile(file);
      }}
    >
      <header className="csv-dataset-header">
        <span
          className={cn(
            "csv-dataset-icon",
            failed && "csv-dataset-icon-failed",
            ready && "csv-dataset-icon-ready"
          )}
          aria-hidden="true"
        >
          {failed ? (
            <AlertTriangle size={22} />
          ) : ready ? (
            <CheckCircle2 size={22} />
          ) : dataset ? (
            <LoaderCircle className="animate-spin" size={22} />
          ) : (
            <FileSpreadsheet size={22} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2>{dataset?.name ?? "Upload a CSV"}</h2>
          <p>
            {dataset
              ? dataset.originalFilename
              : `CSV only, up to ${formatBytes(maxBytes)}. Your data remains isolated to your account.`}
          </p>
        </div>
        {failed ? (
          <Button type="button" variant="secondary" size="sm" onClick={onChoose}>
            <RefreshCw size={15} />
            Retry
          </Button>
        ) : !dataset ? (
          <Button type="button" size="sm" disabled={busy} onClick={onChoose}>
            <Upload size={15} />
            Select CSV
          </Button>
        ) : null}
      </header>

      {!dataset ? (
        <button
          type="button"
          className="csv-drop-target"
          disabled={busy}
          onClick={onChoose}
        >
          <Upload size={18} />
          <span>{busy ? "Preparing upload" : "Drop a CSV here or select a file"}</span>
        </button>
      ) : null}

      {dataset && !ready && !failed ? (
        <div className="dataset-progress-region">
          <div>
            <strong>{uploadProgress !== null ? "Uploading" : statusLabel(status)}</strong>
            <span>{uploadProgress !== null ? `${uploadProgress}%` : "In progress"}</span>
          </div>
          <progress
            max={100}
            value={uploadProgress ?? progressForStatus(status)}
            aria-label={`${statusLabel(status)} progress`}
          />
          <p>You can leave this conversation while processing continues.</p>
        </div>
      ) : null}

      {failed ? (
        <p className="dataset-failure-message">
          {failureMessage(version?.failureCode ?? null)}
        </p>
      ) : null}

      {ready && profile ? (
        <DatasetProfileSummary profile={profile} onSuggestion={onSuggestion} />
      ) : null}

      {error ? <p className="dataset-local-error">{error}</p> : null}
    </section>
  );
}

function statusLabel(status: DatasetVersionStatusContract | null): string {
  switch (status) {
    case "pending_upload":
      return "Waiting for upload";
    case "uploaded":
    case "queued":
      return "Queued for validation";
    case "validating":
      return "Validating CSV";
    case "profiling":
      return "Profiling columns";
    case "indexing":
      return "Saving profile";
    case "deleting":
      return "Deleting dataset";
    default:
      return "Preparing dataset";
  }
}

function progressForStatus(status: DatasetVersionStatusContract | null): number {
  switch (status) {
    case "uploaded":
    case "queued":
      return 55;
    case "validating":
      return 70;
    case "profiling":
      return 82;
    case "indexing":
      return 94;
    default:
      return 10;
  }
}

function failureMessage(code: string | null): string {
  switch (code) {
    case "DATASET_ENCODING_UNSUPPORTED":
      return "This file is not valid UTF-8. Export it as a UTF-8 CSV and try again.";
    case "DATASET_ROW_LIMIT_EXCEEDED":
      return "This CSV contains more rows than the configured limit.";
    case "DATASET_COLUMN_LIMIT_EXCEEDED":
      return "This CSV contains more columns than the configured limit.";
    case "DATASET_FIELD_LIMIT_EXCEEDED":
      return "At least one CSV field exceeds the configured length limit.";
    case "DATASET_ROW_WIDTH_LIMIT_EXCEEDED":
      return "At least one CSV row is too wide to process within the configured memory limit.";
    case "DATASET_EMPTY_FILE":
      return "This CSV is empty or does not contain a header row.";
    case "DATASET_CHECKSUM_MISMATCH":
      return "The uploaded file did not pass integrity verification.";
    case "DATASET_PROFILE_TIMEOUT":
      return "Profiling exceeded the configured processing time.";
    case "DATASET_PROCESSING_FAILED":
      return "Processing could not finish after several attempts. Retry the upload.";
    default:
      return "This file could not be validated as a safe, well-formed CSV.";
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${Math.round(value / 1024 ** 3)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}
