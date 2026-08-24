import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createDatabaseClient, PostgresSuggestionRepository } from "../../src";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("suggestion repository RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const repository = new PostgresSuggestionRepository(createDatabaseClient(app));
  const alice = fixture();
  const bob = fixture();

  beforeAll(async () => {
    await admin.query(
      `insert into users (id, display_name, status)
       values ($1, 'Alice suggestions', 'active'), ($2, 'Bob suggestions', 'active')`,
      [alice.userId, bob.userId]
    );
    for (const [owner, name] of [
      [alice, "Alice revenue"],
      [bob, "Bob private revenue"]
    ] as const) {
      await admin.query(
        `insert into datasets
           (id, user_id, name, original_filename, status, row_count, column_count)
         values ($1, $2, $3, 'revenue.csv', 'ready', 10, 2)`,
        [owner.datasetId, owner.userId, name]
      );
      await admin.query(
        `insert into dataset_versions
           (id, user_id, dataset_id, version_number, original_filename, mime_type,
            object_key, size_bytes, checksum, status, row_count, column_count, profile_version)
         values ($1, $2, $3, 1, 'revenue.csv', 'text/csv', $4, 20, $5,
                 'ready', 10, 2, 1)`,
        [owner.versionId, owner.userId, owner.datasetId, objectKey(owner), "A".repeat(44)]
      );
      await admin.query(
        `insert into dataset_columns
           (id, user_id, dataset_id, dataset_version_id, ordinal, original_name,
            canonical_name, inferred_type, semantic_type, nullable, statistics)
         values ($1, $2, $3, $4, 0, 'region', 'region', 'text', 'categorical', false, $5::jsonb),
                ($6, $2, $3, $4, 1, 'revenue', 'revenue', 'decimal', 'numeric', false, $7::jsonb)`,
        [
          owner.categoryColumnId,
          owner.userId,
          owner.datasetId,
          owner.versionId,
          JSON.stringify({
            version: 1,
            nullCount: 0,
            nullPercentage: 0,
            distinctCount: 3,
            min: null,
            max: null,
            mean: null,
            standardDeviation: null,
            exampleValues: ["EU", "US", "APAC"]
          }),
          owner.numericColumnId,
          JSON.stringify({
            version: 1,
            nullCount: 0,
            nullPercentage: 0,
            distinctCount: 10,
            min: "1",
            max: "10",
            mean: 5.5,
            standardDeviation: 2.9,
            exampleValues: ["1", "10"]
          })
        ]
      );
      await admin.query(`update datasets set active_version_id = $1 where id = $2`, [
        owner.versionId,
        owner.datasetId
      ]);
      await admin.query(
        `insert into conversations
           (id, user_id, title, status, active_dataset_id, active_dataset_version_id)
         values ($1, $2, $3, 'active', $4, $5)`,
        [
          owner.conversationId,
          owner.userId,
          `${name} conversation`,
          owner.datasetId,
          owner.versionId
        ]
      );
    }
  });

  afterAll(async () => {
    await admin.query(`delete from users where id = any($1::uuid[])`, [
      [alice.userId, bob.userId]
    ]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("loads only stored columns from the authenticated active version", async () => {
    const context = await repository.loadContext(alice.userId, alice.conversationId);
    expect(context).toMatchObject({
      state: "ready",
      datasetId: alice.datasetId,
      datasetVersionId: alice.versionId
    });
    if (context.state !== "ready") throw new Error("Expected ready context.");
    expect(context.columns.map((column) => column.id)).toEqual([
      alice.categoryColumnId,
      alice.numericColumnId
    ]);
    expect(context.columns.map((column) => column.originalName)).not.toContain(
      "Bob private revenue"
    );
  });

  it("returns the same hidden state for another user's conversation", async () => {
    await expect(
      repository.loadContext(alice.userId, bob.conversationId)
    ).resolves.toEqual({ state: "conversation_not_found" });
    await expect(
      repository.loadContext(bob.userId, alice.conversationId)
    ).resolves.toEqual({ state: "conversation_not_found" });
  });
});

function fixture() {
  return {
    userId: randomUUID(),
    datasetId: randomUUID(),
    versionId: randomUUID(),
    categoryColumnId: randomUUID(),
    numericColumnId: randomUUID(),
    conversationId: randomUUID()
  };
}

function objectKey(owner: ReturnType<typeof fixture>): string {
  return `users/${owner.userId}/datasets/${owner.datasetId}/versions/${owner.versionId}/original.csv`;
}
