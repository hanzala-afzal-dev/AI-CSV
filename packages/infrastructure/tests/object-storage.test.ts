import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
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

  it("maps missing S3 keys to a safe typed storage error", async () => {
    const missing = new Error("provider detail");
    missing.name = "NoSuchKey";
    const client = {
      send: vi.fn().mockRejectedValue(missing)
    } as unknown as S3Client;

    await expect(
      new S3ObjectStorage(client, "test-bucket").readObject("server-owned-key")
    ).rejects.toMatchObject({
      name: "ObjectStorageError",
      code: "OBJECT_NOT_FOUND",
      message: "The requested object was not found."
    });
  });

  it("keeps upload constraints as signed headers instead of hoisted query values", async () => {
    const client = new S3Client({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
      credentials: { accessKeyId: "test-user", secretAccessKey: "test-secret" }
    });
    const result = await new S3ObjectStorage(client, "test-bucket").createPresignedUpload(
      {
        userId: "11111111-1111-4111-8111-111111111111",
        datasetId: "22222222-2222-4222-8222-222222222222",
        datasetVersionId: "44444444-4444-4444-8444-444444444444",
        uploadIntentId: "33333333-3333-4333-8333-333333333333",
        filename: "sales.csv",
        contentType: "text/csv",
        sizeBytes: 24,
        checksumSha256: `${"A".repeat(43)}=`,
        expiresInSeconds: 900
      }
    );
    const url = new URL(result.uploadUrl);
    const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");

    expect(signedHeaders).toEqual(
      expect.arrayContaining([
        "content-length",
        "content-type",
        "host",
        "x-amz-checksum-sha256",
        "x-amz-meta-upload-intent-id"
      ])
    );
    expect(url.searchParams.has("x-amz-checksum-sha256")).toBe(false);
    expect(url.searchParams.has("x-amz-meta-upload-intent-id")).toBe(false);
    expect(result.requiredHeaders).toEqual({
      "content-type": "text/csv",
      "x-amz-checksum-sha256": `${"A".repeat(43)}=`,
      "x-amz-meta-upload-intent-id": "33333333-3333-4333-8333-333333333333"
    });
  });
});
