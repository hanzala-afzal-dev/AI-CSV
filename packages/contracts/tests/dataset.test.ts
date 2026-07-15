import { describe, expect, it } from "vitest";
import {
  createDatasetRequestSchema,
  datasetSummarySchema,
  uploadIntentResponseSchema
} from "../src";

describe("dataset browser contracts", () => {
  it("accepts only safe CSV filenames", () => {
    expect(
      createDatasetRequestSchema.parse({ name: "Sales", originalFilename: "sales.csv" })
    ).toMatchObject({ originalFilename: "sales.csv" });
    expect(() =>
      createDatasetRequestSchema.parse({
        name: "Sales",
        originalFilename: "../../sales.csv"
      })
    ).toThrow();
    expect(() =>
      createDatasetRequestSchema.parse({ name: "Sales", originalFilename: "sales.exe" })
    ).toThrow();
  });

  it("rejects internal ownership and object-key fields", () => {
    const summary = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Sales",
      originalFilename: "sales.csv",
      status: "pending_upload",
      rowCount: null,
      columnCount: null,
      activeVersion: null,
      createdAt: "2026-07-15T10:00:00.000Z",
      updatedAt: "2026-07-15T10:00:00.000Z"
    };
    expect(() => datasetSummarySchema.parse({ ...summary, userId: "owner" })).toThrow();
    expect(() =>
      datasetSummarySchema.parse({ ...summary, objectKey: "users/x" })
    ).toThrow();
    expect(() =>
      uploadIntentResponseSchema.parse({
        uploadIntentId: summary.id,
        datasetVersionId: summary.id,
        objectKey: "users/x",
        uploadUrl: "https://storage.example/upload",
        method: "PUT",
        requiredHeaders: {},
        expiresAt: "2026-07-15T10:15:00.000Z"
      })
    ).toThrow();
  });
});
