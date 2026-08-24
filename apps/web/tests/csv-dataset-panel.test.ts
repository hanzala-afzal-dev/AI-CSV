import type { DatasetDetailContract } from "@agentic-csv/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CsvDatasetPanel } from "../src/components/datasets/csv-dataset-panel";

const timestamp = "2026-08-09T00:00:00.000Z";
const version = {
  id: "22222222-2222-4222-8222-222222222222",
  versionNumber: 1,
  originalFilename: "sales.csv",
  mimeType: "text/csv" as const,
  sizeBytes: 24,
  status: "pending_upload" as const,
  failureCode: null,
  rowCount: null,
  columnCount: null,
  profileVersion: null,
  createdAt: timestamp,
  updatedAt: timestamp
};
const dataset: DatasetDetailContract = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sales",
  originalFilename: "sales.csv",
  status: "pending_upload",
  rowCount: null,
  columnCount: null,
  activeVersion: version,
  versions: [version],
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("CsvDatasetPanel", () => {
  it("keeps a failed direct upload actionable while the dataset is pending", () => {
    const markup = renderToStaticMarkup(
      createElement(CsvDatasetPanel, {
        dataset,
        profile: null,
        maxBytes: 10_000_000,
        uploadProgress: null,
        busy: false,
        error: "Storage rejected the CSV upload.",
        onChoose: () => undefined,
        onFile: () => undefined
      })
    );

    expect(markup).toContain("Waiting for upload");
    expect(markup).toContain("Storage rejected the CSV upload.");
    expect(markup).toContain("Retry");
  });
});
