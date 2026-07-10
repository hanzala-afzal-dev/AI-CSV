import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const integrationEnabled = Boolean(applicationUrl && migrationUrl);
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("PostgreSQL tenant RLS", () => {
  const adminPool = new Pool({ connectionString: migrationUrl });
  const applicationPool = new Pool({ connectionString: applicationUrl });
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceDatasetId = randomUUID();
  const bobDatasetId = randomUUID();
  const aliceDatasetVersionId = randomUUID();
  const aliceApiKeyHash = "a".repeat(64);

  beforeAll(async () => {
    await adminPool.query(
      `insert into users (id, display_name) values ($1, 'Alice RLS'), ($2, 'Bob RLS')`,
      [aliceId, bobId]
    );
    await adminPool.query(
      `insert into datasets (id, user_id, name, original_filename)
       values ($1, $2, 'Alice dataset', 'alice.csv'),
              ($3, $4, 'Bob dataset', 'bob.csv')`,
      [aliceDatasetId, aliceId, bobDatasetId, bobId]
    );
    await adminPool.query(
      `insert into dataset_versions
         (id, user_id, dataset_id, version_number, original_filename, mime_type,
          object_key, size_bytes, checksum)
       values ($1, $2, $3, 1, 'alice.csv', 'text/csv', $4, 128, $5)`,
      [
        aliceDatasetVersionId,
        aliceId,
        aliceDatasetId,
        `users/${aliceId}/datasets/${aliceDatasetId}/versions/${aliceDatasetVersionId}/original.csv`,
        "A".repeat(44)
      ]
    );
    await adminPool.query(
      `insert into api_keys (user_id, name, key_prefix, key_hash)
       values ($1, 'RLS integration', 'csv_key_integration', $2)`,
      [aliceId, aliceApiKeyHash]
    );
  });

  afterAll(async () => {
    await adminPool.query(`delete from users where id = any($1::uuid[])`, [
      [aliceId, bobId]
    ]);
    await Promise.all([adminPool.end(), applicationPool.end()]);
  });

  it("returns no tenant rows when actor context is absent", async () => {
    const result = await applicationPool.query(
      `select id from datasets where id = any($1::uuid[])`,
      [[aliceDatasetId, bobDatasetId]]
    );
    expect(result.rows).toEqual([]);
  });

  it("returns only the current user's rows", async () => {
    const client = await applicationPool.connect();
    try {
      const rows = await inActorTransaction(client, aliceId, async () =>
        client.query(`select id from datasets where id = any($1::uuid[]) order by id`, [
          [aliceDatasetId, bobDatasetId]
        ])
      );
      expect(rows.rows).toEqual([{ id: aliceDatasetId }]);
    } finally {
      client.release();
    }
  });

  it("rejects a row owned by another user", async () => {
    const client = await applicationPool.connect();
    try {
      await expect(
        inActorTransaction(client, aliceId, () =>
          client.query(
            `insert into datasets (id, user_id, name, original_filename)
             values ($1, $2, 'Cross tenant', 'cross.csv')`,
            [randomUUID(), bobId]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
    }
  });

  it("enforces version ownership in RLS and relational constraints", async () => {
    const client = await applicationPool.connect();
    try {
      const visible = await inActorTransaction(client, aliceId, () =>
        client.query(`select id from dataset_versions where id = $1`, [
          aliceDatasetVersionId
        ])
      );
      expect(visible.rows).toEqual([{ id: aliceDatasetVersionId }]);

      await expect(
        inActorTransaction(client, aliceId, () =>
          client.query(
            `insert into dataset_versions
               (id, user_id, dataset_id, version_number, original_filename, mime_type,
                object_key, size_bytes, checksum)
             values ($1, $2, $3, 1, 'cross.csv', 'text/csv', $4, 1, $5)`,
            [randomUUID(), aliceId, bobDatasetId, "cross/original.csv", "B".repeat(44)]
          )
        )
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      client.release();
    }
  });

  it("authenticates through the constrained function without direct key-table access", async () => {
    const authenticated = await applicationPool.query(
      `select id, user_id from public.authenticate_api_key($1)`,
      [aliceApiKeyHash]
    );
    expect(authenticated.rows).toHaveLength(1);
    expect(authenticated.rows[0]?.user_id).toBe(aliceId);

    await expect(
      applicationPool.query(`select id from api_keys limit 1`)
    ).rejects.toMatchObject({
      code: "42501"
    });
  });
});

async function inActorTransaction<TResult>(
  client: PoolClient,
  userId: string,
  work: () => Promise<TResult>
): Promise<TResult> {
  await client.query("begin");
  try {
    await client.query(`select set_config('app.current_user_id', $1, true)`, [userId]);
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
