import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "../src";

describe("S3ObjectStorage object keys", () => {
  const storage = new S3ObjectStorage({} as S3Client, "test-bucket");

  it("creates a user, dataset, and version scoped key", () => {
    expect(
      storage.createObjectKey({
        userId: "11111111-1111-4111-8111-111111111111",
        datasetId: "22222222-2222-4222-8222-222222222222",
        datasetVersionId: "44444444-4444-4444-8444-444444444444",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "../../quarterly sales.csv"
      })
    ).toBe(
      "users/11111111-1111-4111-8111-111111111111/datasets/22222222-2222-4222-8222-222222222222/versions/44444444-4444-4444-8444-444444444444/original.csv"
    );
  });

  it("accepts UUIDv7 dataset IDs used by the dataset aggregate", () => {
    expect(
      storage.createObjectKey({
        userId: "11111111-1111-4111-8111-111111111111",
        datasetId: "019f3bb6-9a18-7f82-85e0-86f1423eb80a",
        datasetVersionId: "44444444-4444-4444-8444-444444444444",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "sales.csv"
      })
    ).toBe(
      "users/11111111-1111-4111-8111-111111111111/datasets/019f3bb6-9a18-7f82-85e0-86f1423eb80a/versions/44444444-4444-4444-8444-444444444444/original.csv"
    );
  });

  it("rejects path-like ownership identifiers", () => {
    expect(() =>
      storage.createObjectKey({
        userId: "../another-owner",
        datasetId: "22222222-2222-4222-8222-222222222222",
        datasetVersionId: "44444444-4444-4444-8444-444444444444",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "sales.csv"
      })
    ).toThrow("userId must be a UUID");
  });
});
