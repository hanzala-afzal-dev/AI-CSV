import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createDatabaseClient, PostgresPrivacyDeletionRepository } from "../../src";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("privacy deletion repository and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const repository = new PostgresPrivacyDeletionRepository(createDatabaseClient(app));
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceDatasetId = randomUUID();
  const bobDatasetId = randomUUID();
  const aliceVersionId = randomUUID();
  const bobVersionId = randomUUID();
  const deletionId = randomUUID();
  const clientRequestId = randomUUID();
  const now = new Date("2026-08-23T12:00:00.000Z");

  beforeAll(async () => {
    await admin.query(
      `insert into users (id, display_name, status)
       values ($1, 'Alice Phase 9', 'active'), ($2, 'Bob Phase 9', 'active')`,
      [aliceId, bobId]
    );
    await admin.query(
      `insert into datasets
         (id, user_id, name, original_filename, status)
       values ($1, $2, 'Alice dataset', 'alice.csv', 'ready'),
              ($3, $4, 'Bob dataset', 'bob.csv', 'ready')`,
      [aliceDatasetId, aliceId, bobDatasetId, bobId]
    );
    await admin.query(
      `insert into dataset_versions (
         id, user_id, dataset_id, version_number, original_filename,
         mime_type, object_key, size_bytes, checksum, status
       ) values
         ($1, $2, $3, 1, 'alice.csv', 'text/csv', $4, 20, $5, 'ready'),
         ($6, $7, $8, 1, 'bob.csv', 'text/csv', $9, 20, $5, 'ready')`,
      [
        aliceVersionId,
        aliceId,
        aliceDatasetId,
        objectKey(aliceId, aliceDatasetId, aliceVersionId),
        "A".repeat(44),
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
       end
       where id = any($5::uuid[])`,
      [
        aliceDatasetId,
        aliceVersionId,
        bobDatasetId,
        bobVersionId,
        [aliceDatasetId, bobDatasetId]
      ]
    );
  });

  afterAll(async () => {
    await admin.query(
      `delete from privacy_deletion_audits
       where subject_hash in (
         encode(digest($1::text, 'sha256'), 'hex'),
         encode(digest($2::text, 'sha256'), 'hex')
       )`,
      [aliceId, bobId]
    );
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

  it("hides requests without actor context and blocks cross-owner scheduling", async () => {
    await expect(
      repository.scheduleDataset({
        deletionId: randomUUID(),
        userId: aliceId,
        datasetId: bobDatasetId,
        clientRequestId: randomUUID(),
        correlationId: "alice-cannot-delete-bob",
        requestedAt: now
      })
    ).resolves.toBeNull();
    expect((await app.query(`select id from privacy_deletion_requests`)).rows).toEqual(
      []
    );
  });

  it("atomically schedules one owner-scoped idempotent request and outbox event", async () => {
    const first = await repository.scheduleDataset({
      deletionId,
      userId: aliceId,
      datasetId: aliceDatasetId,
      clientRequestId,
      correlationId: "phase9-integration",
      requestedAt: now
    });
    const replay = await repository.scheduleDataset({
      deletionId: randomUUID(),
      userId: aliceId,
      datasetId: aliceDatasetId,
      clientRequestId,
      correlationId: "phase9-integration-replay",
      requestedAt: new Date(now.getTime() + 1000)
    });

    expect(first).toMatchObject({
      id: deletionId,
      userId: aliceId,
      scope: "dataset",
      datasetId: aliceDatasetId,
      status: "scheduled"
    });
    expect(replay?.id).toBe(deletionId);

    const persisted = await admin.query(
      `select d.status, v.status as version_status, o.event_name, o.payload
       from datasets d
       join dataset_versions v on v.dataset_id = d.id
       join outbox_events o on o.aggregate_id = $1
       where d.id = $2`,
      [deletionId, aliceDatasetId]
    );
    expect(persisted.rows[0]).toMatchObject({
      status: "deleting",
      version_status: "deleting",
      event_name: "queue.privacy.delete.v1",
      payload: {
        userId: aliceId,
        deletionId,
        jobName: "privacy.delete.v1"
      }
    });
  });

  it("claims only as the owner and finalizes a safe dataset tombstone", async () => {
    await expect(
      repository.claim({
        deletionId,
        userId: bobId,
        claimedAt: now
      })
    ).resolves.toBeNull();

    const claimed = await repository.claim({
      deletionId,
      userId: aliceId,
      claimedAt: now
    });
    expect(claimed?.objectKeys).toEqual([
      objectKey(aliceId, aliceDatasetId, aliceVersionId)
    ]);

    await repository.complete({
      deletionId,
      userId: aliceId,
      completedAt: new Date(now.getTime() + 2000)
    });

    const tombstone = await admin.query(
      `select name, original_filename, status, row_count, deleted_at
       from datasets where id = $1`,
      [aliceDatasetId]
    );
    expect(tombstone.rows[0]).toMatchObject({
      name: "Deleted dataset",
      original_filename: "deleted.csv",
      status: "deleted",
      row_count: null
    });
    expect(
      (
        await admin.query(`select id from dataset_versions where dataset_id = $1`, [
          aliceDatasetId
        ])
      ).rows
    ).toEqual([]);
    expect(
      (
        await admin.query(
          `select status, object_keys from privacy_deletion_requests where id = $1`,
          [deletionId]
        )
      ).rows[0]
    ).toMatchObject({ status: "completed", object_keys: [] });
    expect(
      (
        await admin.query(
          `select scope, object_count from privacy_deletion_audits where resource_hash = encode(digest($1::text, 'sha256'), 'hex')`,
          [aliceDatasetId]
        )
      ).rows[0]
    ).toEqual({ scope: "dataset", object_count: 1 });
    expect(
      (await admin.query(`select status from datasets where id = $1`, [bobDatasetId]))
        .rows[0]
    ).toEqual({ status: "ready" });
  });

  it("removes the complete account graph while retaining only hashed audit metadata", async () => {
    const accountDeletionId = randomUUID();
    const scheduled = await repository.scheduleAccount({
      deletionId: accountDeletionId,
      userId: bobId,
      clientRequestId: randomUUID(),
      correlationId: "phase9-account-integration",
      requestedAt: new Date(now.getTime() + 3000)
    });
    expect(scheduled).toMatchObject({
      id: accountDeletionId,
      scope: "account",
      status: "scheduled"
    });

    const claimed = await repository.claim({
      deletionId: accountDeletionId,
      userId: bobId,
      claimedAt: new Date(now.getTime() + 4000)
    });
    expect(claimed?.objectKeys).toEqual([objectKey(bobId, bobDatasetId, bobVersionId)]);

    await repository.complete({
      deletionId: accountDeletionId,
      userId: bobId,
      completedAt: new Date(now.getTime() + 5000)
    });

    expect(
      (await admin.query(`select id from users where id = $1`, [bobId])).rows
    ).toEqual([]);
    expect(
      (await admin.query(`select id from datasets where user_id = $1`, [bobId])).rows
    ).toEqual([]);
    expect(
      (
        await admin.query(
          `select subject_hash, resource_hash, scope, object_count
         from privacy_deletion_audits
         where subject_hash = encode(digest($1::text, 'sha256'), 'hex')
           and scope = 'account'`,
          [bobId]
        )
      ).rows[0]
    ).toMatchObject({
      resource_hash: null,
      scope: "account",
      object_count: 1
    });
  });
});

function objectKey(userId: string, datasetId: string, versionId: string): string {
  return `users/${userId}/datasets/${datasetId}/versions/${versionId}/original.csv`;
}
