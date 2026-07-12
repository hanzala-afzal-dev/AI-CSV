import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("identity sessions and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceSessionId = randomUUID();
  const bobSessionId = randomUUID();
  const now = new Date();
  const later = new Date(now.getTime() + 60_000);
  const expiry = new Date(now.getTime() + 3_600_000);

  beforeAll(async () => {
    await app.query(`select public.identity_register($1, $2, $3, $4, $5, $6)`, [
      aliceId,
      "alice.phase2@example.com",
      "Alice Phase 2",
      "$argon2id$fake",
      "a".repeat(64),
      expiry
    ]);
    await app.query(`select public.identity_register($1, $2, $3, $4, $5, $6)`, [
      bobId,
      "bob.phase2@example.com",
      "Bob Phase 2",
      "$argon2id$fake",
      "b".repeat(64),
      expiry
    ]);
    await expect(
      app.query(`select public.identity_consume_verification($1, $2)`, [
        "a".repeat(64),
        now
      ])
    ).resolves.toMatchObject({ rows: [{ identity_consume_verification: true }] });
    await app.query(`select public.identity_consume_verification($1, $2)`, [
      "b".repeat(64),
      now
    ]);
    await app.query(
      `select public.identity_create_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        aliceSessionId,
        aliceId,
        "c".repeat(64),
        "d".repeat(64),
        "Alice browser",
        "e".repeat(64),
        expiry,
        expiry,
        null,
        now
      ]
    );
    await app.query(
      `select public.identity_create_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        bobSessionId,
        bobId,
        "f".repeat(64),
        "1".repeat(64),
        "Bob browser",
        "2".repeat(64),
        expiry,
        expiry,
        null,
        now
      ]
    );
  });

  afterAll(async () => {
    await admin.query(`delete from users where id = any($1::uuid[])`, [[aliceId, bobId]]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("keeps users and sessions invisible without actor context", async () => {
    expect(
      (await app.query(`select id from users where id = $1`, [aliceId])).rows
    ).toEqual([]);
    expect(
      (await app.query(`select id from sessions where user_id = $1`, [aliceId])).rows
    ).toEqual([]);
    await expect(
      app.query(`select token_hash from verification_tokens`)
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      app.query(`select token_hash from password_reset_tokens`)
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("shows Alice only her own sessions", async () => {
    const client = await app.connect();
    try {
      const result = await asActor(client, aliceId, () =>
        client.query(`select id from sessions where id = any($1::uuid[])`, [
          [aliceSessionId, bobSessionId]
        ])
      );
      expect(result.rows).toEqual([{ id: aliceSessionId }]);
    } finally {
      client.release();
    }
  });

  it("authenticates active sessions and rejects expiry and revocation", async () => {
    const active = await app.query(
      `select * from public.identity_authenticate_session($1,$2,$3)`,
      ["c".repeat(64), later, 1800]
    );
    expect(active.rows[0]).toMatchObject({
      id: aliceSessionId,
      user_id: aliceId,
      email: "alice.phase2@example.com"
    });
    await app.query(`select public.identity_revoke_session($1,$2)`, [
      "c".repeat(64),
      later
    ]);
    expect(
      (
        await app.query(`select * from public.identity_authenticate_session($1,$2,$3)`, [
          "c".repeat(64),
          later,
          1800
        ])
      ).rows
    ).toEqual([]);
    expect(
      (
        await app.query(`select * from public.identity_authenticate_session($1,$2,$3)`, [
          "f".repeat(64),
          new Date(expiry.getTime() + 1),
          1800
        ])
      ).rows
    ).toEqual([]);
  });

  it("consumes reset tokens once and revokes sessions", async () => {
    const resetHash = "3".repeat(64);
    const issued = await app.query(
      `select * from public.identity_issue_password_reset($1,$2,$3,$4)`,
      ["bob.phase2@example.com", resetHash, expiry, now]
    );
    expect(issued.rows).toHaveLength(1);
    expect(
      (
        await app.query(`select public.identity_reset_password($1,$2,$3) as reset`, [
          resetHash,
          "$argon2id$new",
          later
        ])
      ).rows[0]?.reset
    ).toBe(true);
    expect(
      (
        await app.query(`select public.identity_reset_password($1,$2,$3) as reset`, [
          resetHash,
          "$argon2id$replay",
          later
        ])
      ).rows[0]?.reset
    ).toBe(false);
    expect(
      (
        await app.query(`select * from public.identity_authenticate_session($1,$2,$3)`, [
          "f".repeat(64),
          later,
          1800
        ])
      ).rows
    ).toEqual([]);
  });

  it("does not disclose whether login lookup misses through table access", async () => {
    const existing = await app.query(`select * from public.identity_find_login($1)`, [
      "alice.phase2@example.com"
    ]);
    const missing = await app.query(`select * from public.identity_find_login($1)`, [
      "missing.phase2@example.com"
    ]);
    expect(existing.rows).toHaveLength(1);
    expect(missing.rows).toEqual([]);
    await expect(app.query(`select password_hash from users`)).resolves.toMatchObject({
      rows: []
    });
  });
});

async function asActor<TResult>(
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
