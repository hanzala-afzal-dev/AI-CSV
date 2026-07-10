import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "../src";

describe("S3ObjectStorage object keys", () => {
  const storage = new S3ObjectStorage({} as S3Client, "test-bucket");

  it("creates an owner, dataset, and upload scoped key", () => {
    expect(
      storage.createObjectKey({
        ownerId: "11111111-1111-4111-8111-111111111111",
        datasetId: "22222222-2222-4222-8222-222222222222",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "../../quarterly sales.csv"
      })
    ).toBe(
      "owners/11111111-1111-4111-8111-111111111111/datasets/22222222-2222-4222-8222-222222222222/uploads/33333333-3333-4333-8333-333333333333/quarterly-sales.csv"
    );
  });

  it("rejects path-like ownership identifiers", () => {
    expect(() =>
      storage.createObjectKey({
        ownerId: "../another-owner",
        datasetId: "22222222-2222-4222-8222-222222222222",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "sales.csv"
      })
    ).toThrow("ownerId must be a UUID");
  });
});
