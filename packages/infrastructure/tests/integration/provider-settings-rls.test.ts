import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { createDatabaseClient } from "../../src/database/client";
import { PostgresProviderSettingsRepository } from "../../src/providers";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("provider settings repository and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const repository = new PostgresProviderSettingsRepository(createDatabaseClient(app));
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const repositoryUserId = randomUUID();
  const aliceCredentialId = randomUUID();
  const bobCredentialId = randomUUID();
  const now = new Date("2026-07-13T12:00:00.000Z");
  const expiry = new Date("2026-07-14T12:00:00.000Z");
  const nonce = Buffer.alloc(12, 1).toString("base64");
  const authTag = Buffer.alloc(16, 2).toString("base64");

  beforeAll(async () => {
    await registerUser(app, aliceId, "alice.phase3@example.com", expiry);
    await registerUser(app, bobId, "bob.phase3@example.com", expiry);
    await registerUser(app, repositoryUserId, "repository.phase3@example.com", expiry);
    await insertProviderFixture(app, {
      userId: aliceId,
      credentialId: aliceCredentialId,
      ciphertext: "YWxpY2UtY2lwaGVydGV4dA==",
      last4: "lice",
      nonce,
      authTag,
      now
    });
    await insertProviderFixture(app, {
      userId: bobId,
      credentialId: bobCredentialId,
      ciphertext: "Ym9iLWNpcGhlcnRleHQ=",
      last4: "-bob",
      nonce,
      authTag,
      now
    });
  });

  afterAll(async () => {
    await admin.query(`delete from users where id = any($1::uuid[])`, [
      [aliceId, bobId, repositoryUserId]
    ]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("fails closed without actor context and denies direct secret-column reads", async () => {
    await expect(
      app.query(`select ciphertext from provider_credentials`)
    ).rejects.toMatchObject({ code: "42501" });
    expect((await app.query(`select id from provider_credentials`)).rows).toEqual([]);
    expect((await app.query(`select user_id from provider_preferences`)).rows).toEqual(
      []
    );
    expect((await app.query(`select id from security_audit_events`)).rows).toEqual([]);
    expect(
      (await app.query(`select * from public.provider_get_credential_secret('openai')`))
        .rows
    ).toEqual([]);
  });

  it("shows Alice only her own summary, preference, and audit rows", async () => {
    const client = await app.connect();
    try {
      const result = await asActor(client, aliceId, async () => ({
        credentials: await client.query(
          `select id, last4 from provider_credentials order by id`
        ),
        preferences: await client.query(
          `select user_id, model_id from provider_preferences order by user_id`
        ),
        audits: await client.query(
          `select subject_id, event_type from security_audit_events order by subject_id`
        )
      }));
      expect(result.credentials.rows).toEqual([{ id: aliceCredentialId, last4: "lice" }]);
      expect(result.preferences.rows).toEqual([
        { user_id: aliceId, model_id: "gpt-5.5" }
      ]);
      expect(result.audits.rows).toEqual([
        {
          subject_id: aliceCredentialId,
          event_type: "provider.credential.added"
        }
      ]);
    } finally {
      client.release();
    }
  });

  it("exposes encrypted material only through the actor-scoped function", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(`select ciphertext from provider_credentials`)
        )
      ).rejects.toMatchObject({ code: "42501" });
      const result = await asActor(client, aliceId, () =>
        client.query(`select * from public.provider_get_credential_secret('openai')`)
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: aliceCredentialId,
        ciphertext: "YWxpY2UtY2lwaGVydGV4dA==",
        last4: "lice"
      });
      expect(result.rows[0]).not.toHaveProperty("user_id");
    } finally {
      client.release();
    }
  });

  it("rejects cross-user inserts and cannot mutate Bob through Alice context", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `insert into provider_credentials
               (id, user_id, provider, ciphertext, nonce, auth_tag, algorithm,
                key_version, last4, fingerprint, status, validated_at)
             values ($1, $2, 'openai', $3, $4, $5, 'AES-256-GCM',
                     'v1', 'ross', $6, 'valid', $7)`,
            [randomUUID(), bobId, "Y3Jvc3MtdGVuYW50", nonce, authTag, "c".repeat(64), now]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

      const update = await asActor(client, aliceId, () =>
        client.query(
          `update provider_preferences set model_id = 'gpt-5' where user_id = $1`,
          [bobId]
        )
      );
      expect(update.rowCount).toBe(0);
      const deletion = await asActor(client, aliceId, () =>
        client.query(`delete from provider_credentials where id = $1`, [bobCredentialId])
      );
      expect(deletion.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("keeps audit rows append-only and enforces constrained metadata", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(`update security_audit_events set outcome = 'failure'`)
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () => client.query(`delete from security_audit_events`))
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `insert into security_audit_events
               (user_id, event_type, outcome, subject_type, subject_id,
                correlation_id, metadata, occurred_at)
             values ($1, 'provider.credential.added', 'success',
                     'provider_credential', $2, $3, $4::jsonb, $5)`,
            [
              aliceId,
              aliceCredentialId,
              randomUUID(),
              JSON.stringify({ apiKey: "must-not-be-accepted" }),
              now
            ]
          )
        )
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      client.release();
    }
  });

  it("runs the real repository lifecycle through least-privilege grants", async () => {
    const credentialId = randomUUID();
    const correlationId = randomUUID();
    const settings = await repository.replaceCredential({
      userId: repositoryUserId,
      credentialId,
      provider: "openai",
      encrypted: {
        ciphertext: "cmVwb3NpdG9yeS1jaXBoZXJ0ZXh0",
        nonce,
        authTag,
        algorithm: "AES-256-GCM",
        keyVersion: "v1",
        fingerprint: "d".repeat(64)
      },
      last4: "test",
      validatedAt: now,
      preference: {
        modelId: "gpt-5.5",
        reasoningEffort: "medium",
        reasoningMode: null,
        modelValidatedAt: now
      },
      fallbackApplied: false,
      correlationId
    });
    expect(settings).toMatchObject({
      credential: { id: credentialId, last4: "test", status: "valid" },
      preference: { modelId: "gpt-5.5", reasoningEffort: "medium" }
    });

    const encrypted = await repository.getEncryptedCredential(repositoryUserId);
    expect(encrypted).toMatchObject({
      id: credentialId,
      ciphertext: "cmVwb3NpdG9yeS1jaXBoZXJ0ZXh0",
      userId: repositoryUserId
    });

    await expect(
      repository.deleteCredential({
        userId: repositoryUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(now.getTime() + 1000)
      })
    ).resolves.toEqual({
      credential: null,
      preference: null
    });

    const auditCount = await admin.query(
      `select count(*)::integer as count
       from security_audit_events
       where user_id = $1 and subject_id = $2`,
      [repositoryUserId, credentialId]
    );
    expect(auditCount.rows).toEqual([{ count: 2 }]);
  });
});

async function registerUser(
  app: Pool,
  userId: string,
  email: string,
  expiry: Date
): Promise<void> {
  const tokenHash = createHash("sha256").update(userId).digest("hex");
  await app.query(`select public.identity_register($1, $2, $3, $4, $5, $6)`, [
    userId,
    email,
    email.split("@", 1)[0],
    "$argon2id$phase3-fixture",
    tokenHash,
    expiry
  ]);
}

async function insertProviderFixture(
  app: Pool,
  fixture: {
    readonly userId: string;
    readonly credentialId: string;
    readonly ciphertext: string;
    readonly last4: string;
    readonly nonce: string;
    readonly authTag: string;
    readonly now: Date;
  }
): Promise<void> {
  const client = await app.connect();
  try {
    await asActor(client, fixture.userId, async () => {
      await client.query(
        `insert into provider_credentials
           (id, user_id, provider, ciphertext, nonce, auth_tag, algorithm,
            key_version, last4, fingerprint, status, validated_at)
         values ($1, $2, 'openai', $3, $4, $5, 'AES-256-GCM',
                 'v1', $6, $7, 'valid', $8)`,
        [
          fixture.credentialId,
          fixture.userId,
          fixture.ciphertext,
          fixture.nonce,
          fixture.authTag,
          fixture.last4,
          createHash("sha256").update(fixture.credentialId).digest("hex"),
          fixture.now
        ]
      );
      await client.query(
        `insert into provider_preferences
           (user_id, provider, model_id, reasoning_effort, model_validated_at)
         values ($1, 'openai', 'gpt-5.5', 'medium', $2)`,
        [fixture.userId, fixture.now]
      );
      await client.query(
        `insert into security_audit_events
           (user_id, event_type, outcome, subject_type, subject_id,
            correlation_id, metadata, occurred_at)
         values ($1, 'provider.credential.added', 'success',
                 'provider_credential', $2, $3, $4::jsonb, $5)`,
        [
          fixture.userId,
          fixture.credentialId,
          randomUUID(),
          JSON.stringify({ provider: "openai" }),
          fixture.now
        ]
      );
    });
  } finally {
    client.release();
  }
}

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
