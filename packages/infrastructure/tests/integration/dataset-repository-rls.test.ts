import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import {
  InitiateDatasetUploadHandler,
  type ObjectStorage
} from "@agentic-csv/application";
import type { DatasetProfileContract } from "@agentic-csv/contracts";
import {
  createDatabaseClient,
  DrizzleUnitOfWork,
  PostgresDatasetRepository
} from "../../src";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("dataset repository ingestion and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const database = createDatabaseClient(app);
  const repository = new PostgresDatasetRepository(database);
  const unitOfWork = new DrizzleUnitOfWork(database);
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceDatasetId = randomUUID();
  const aliceVersionId = randomUUID();
  const aliceClaimDatasetId = randomUUID();
  const aliceClaimVersionId = randomUUID();
  const bobDatasetId = randomUUID();
  const bobVersionId = randomUUID();
  const checksum = "A".repeat(43) + "=";
  const startedAt = new Date("2026-07-15T12:00:00.000Z");

  beforeAll(async () => {
    await admin.query(
      `insert into users (id, display_name)
       values ($1, 'Alice Phase 5'), ($2, 'Bob Phase 5')`,
      [aliceId, bobId]
    );
    await admin.query(
      `insert into datasets
         (id, user_id, name, original_filename, status, object_key)
       values ($1, $2, 'Alice sales', 'sales.csv', 'uploaded', $3),
              ($4, $2, 'Alice claim', 'claim.csv', 'uploaded', $5),
              ($6, $7, 'Bob private', 'private.csv', 'uploaded', $8)`,
      [
        aliceDatasetId,
        aliceId,
        objectKey(aliceId, aliceDatasetId, aliceVersionId),
        aliceClaimDatasetId,
        objectKey(aliceId, aliceClaimDatasetId, aliceClaimVersionId),
        bobDatasetId,
        bobId,
        objectKey(bobId, bobDatasetId, bobVersionId)
      ]
    );
    await admin.query(
      `insert into dataset_versions
         (id, user_id, dataset_id, version_number, original_filename, mime_type,
          object_key, size_bytes, checksum, status)
       values ($1, $2, $3, 1, 'sales.csv', 'text/csv', $4, 24, $5, 'queued'),
              ($6, $2, $7, 1, 'claim.csv', 'text/csv', $8, 24, $5, 'queued'),
              ($9, $10, $11, 1, 'private.csv', 'text/csv', $12, 24, $5, 'queued')`,
      [
        aliceVersionId,
        aliceId,
        aliceDatasetId,
        objectKey(aliceId, aliceDatasetId, aliceVersionId),
        checksum,
        aliceClaimVersionId,
        aliceClaimDatasetId,
        objectKey(aliceId, aliceClaimDatasetId, aliceClaimVersionId),
        bobVersionId,
        bobId,
        bobDatasetId,
        objectKey(bobId, bobDatasetId, bobVersionId)
      ]
    );
    await admin.query(
      `update datasets
       set active_version_id = case id
         when $1::uuid then $2::uuid
         when $3::uuid then $4::uuid
         when $5::uuid then $6::uuid
       end
       where id = any($7::uuid[])`,
      [
        aliceDatasetId,
        aliceVersionId,
        aliceClaimDatasetId,
        aliceClaimVersionId,
        bobDatasetId,
        bobVersionId,
        [aliceDatasetId, aliceClaimDatasetId, bobDatasetId]
      ]
    );
  });

  afterAll(async () => {
    await admin.query(
      `update datasets set active_version_id = null
       where user_id = any($1::uuid[])`,
      [[aliceId, bobId]]
    );
    await admin.query(`delete from dataset_versions where user_id = any($1::uuid[])`, [
      [aliceId, bobId]
    ]);
    await admin.query(`delete from datasets where user_id = any($1::uuid[])`, [
      [aliceId, bobId]
    ]);
    await admin.query(`delete from users where id = any($1::uuid[])`, [[aliceId, bobId]]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("lists only Alice datasets and hides Bob nested reads", async () => {
    const listed = await repository.list(aliceId, 10);

    expect(listed.map((dataset) => dataset.id)).toEqual(
      expect.arrayContaining([aliceDatasetId, aliceClaimDatasetId])
    );
    expect(listed.map((dataset) => dataset.id)).not.toContain(bobDatasetId);
    await expect(repository.getDetail(aliceId, bobDatasetId)).resolves.toBeNull();
    await expect(
      repository.getProfile(aliceId, bobDatasetId, bobVersionId)
    ).resolves.toBeNull();
  });

  it("does not issue Bob a signed upload capability for Alice's dataset", async () => {
    const createPresignedUpload = vi.fn();
    const handler = new InitiateDatasetUploadHandler(
      unitOfWork,
      { createPresignedUpload } as unknown as ObjectStorage,
      1_000,
      900
    );

    await expect(
      handler.execute({
        userId: bobId,
        datasetId: aliceDatasetId,
        contentType: "text/csv",
        sizeBytes: 24,
        checksumSha256: checksum
      })
    ).rejects.toMatchObject({ code: "DATASET_NOT_FOUND" });
    expect(createPresignedUpload).not.toHaveBeenCalled();
  });

  it("claims, profiles, persists, and terminally deduplicates ingestion", async () => {
    const claimId = "dataset-job-1";
    const claim = await repository.claim({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceVersionId,
      claimId,
      claimedAt: startedAt,
      claimTtlSeconds: 300
    });
    expect(claim).toMatchObject({ state: "claimed" });

    await repository.markProfiling({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceVersionId,
      claimId,
      occurredAt: new Date(startedAt.getTime() + 1_000)
    });
    await repository.markIndexing({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceVersionId,
      claimId,
      occurredAt: new Date(startedAt.getTime() + 2_000)
    });
    await repository.complete({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceVersionId,
      claimId,
      occurredAt: new Date(startedAt.getTime() + 3_000),
      profile
    });

    const detail = await repository.getDetail(aliceId, aliceDatasetId);
    const stored = await repository.getProfile(aliceId, aliceDatasetId, aliceVersionId);
    expect(detail).toMatchObject({ status: "ready", rowCount: 2, columnCount: 2 });
    expect(detail?.activeVersion).toMatchObject({
      id: aliceVersionId,
      status: "ready",
      profileVersion: 1
    });
    expect(stored?.profile).toEqual(profile);
    await expect(
      repository.claim({
        userId: aliceId,
        datasetId: aliceDatasetId,
        datasetVersionId: aliceVersionId,
        claimId: "duplicate-job",
        claimedAt: new Date(startedAt.getTime() + 4_000),
        claimTtlSeconds: 300
      })
    ).resolves.toEqual({ state: "terminal" });
  });

  it("blocks a concurrent claim and permits a stale-claim takeover", async () => {
    const first = await repository.claim({
      userId: aliceId,
      datasetId: aliceClaimDatasetId,
      datasetVersionId: aliceClaimVersionId,
      claimId: "first-job",
      claimedAt: startedAt,
      claimTtlSeconds: 300
    });
    expect(first.state).toBe("claimed");

    await expect(
      repository.claim({
        userId: aliceId,
        datasetId: aliceClaimDatasetId,
        datasetVersionId: aliceClaimVersionId,
        claimId: "second-job",
        claimedAt: new Date(startedAt.getTime() + 1_000),
        claimTtlSeconds: 300
      })
    ).resolves.toEqual({ state: "busy" });

    const takeover = await repository.claim({
      userId: aliceId,
      datasetId: aliceClaimDatasetId,
      datasetVersionId: aliceClaimVersionId,
      claimId: "second-job",
      claimedAt: new Date(startedAt.getTime() + 301_000),
      claimTtlSeconds: 300
    });
    expect(takeover.state).toBe("claimed");
    await repository.fail({
      userId: aliceId,
      datasetId: aliceClaimDatasetId,
      datasetVersionId: aliceClaimVersionId,
      claimId: "second-job",
      occurredAt: new Date(startedAt.getTime() + 302_000),
      code: "DATASET_PROCESSING_FAILED"
    });
    await expect(
      repository.getDetail(aliceId, aliceClaimDatasetId)
    ).resolves.toMatchObject({ status: "failed" });
  });
});

const profile: DatasetProfileContract = {
  version: 1,
  rowCount: 2,
  columnCount: 2,
  encoding: "utf-8",
  delimiter: ",",
  columns: [
    column(0, "country", "text", "categorical", ["DE", "FR"]),
    column(1, "amount", "integer", "numeric", ["10", "20"])
  ],
  warnings: [],
  suggestedPrompts: [
    "Summarize amount.",
    "Compare records by country.",
    "Which columns contain missing values?"
  ],
  generatedAt: "2026-07-15T12:00:02.000Z"
};

function column(
  ordinal: number,
  name: string,
  inferredType: "integer" | "text",
  semanticType: "numeric" | "categorical",
  examples: string[]
) {
  return {
    ordinal,
    originalName: name,
    canonicalName: name,
    inferredType,
    semanticType,
    nullable: false,
    statistics: {
      version: 1 as const,
      nullCount: 0,
      nullPercentage: 0,
      distinctCount: 2,
      min: examples[0] ?? null,
      max: examples[1] ?? null,
      mean: inferredType === "integer" ? 15 : null,
      standardDeviation: inferredType === "integer" ? 5 : null,
      exampleValues: examples
    }
  };
}

function objectKey(userId: string, datasetId: string, versionId: string): string {
  return `users/${userId}/datasets/${datasetId}/versions/${versionId}/original.csv`;
}
