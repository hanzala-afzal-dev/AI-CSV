import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { Conversation } from "@agentic-csv/domain";
import { createDatabaseClient } from "../../src/database/client";
import { PostgresConversationRepository } from "../../src/conversations";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("conversation repository and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const repository = new PostgresConversationRepository(createDatabaseClient(app));
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceConversationId = randomUUID();
  const bobConversationId = randomUUID();
  const expiry = new Date("2026-07-15T12:00:00.000Z");
  const now = new Date("2026-07-13T12:00:00.000Z");

  beforeAll(async () => {
    await registerUser(app, aliceId, "alice.phase4@example.com", expiry);
    await registerUser(app, bobId, "bob.phase4@example.com", expiry);
    await repository.create(
      Conversation.create({
        id: aliceConversationId,
        userId: aliceId,
        title: "Alice conversation",
        now
      }).toPrimitives()
    );
    await repository.create(
      Conversation.create({
        id: bobConversationId,
        userId: bobId,
        title: "Bob conversation",
        now
      }).toPrimitives()
    );
  });

  afterAll(async () => {
    await admin.query(`delete from users where id = any($1::uuid[])`, [[aliceId, bobId]]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("fails closed without actor context on every Phase 4 tenant table", async () => {
    expect((await app.query(`select id from conversations`)).rows).toEqual([]);
    expect((await app.query(`select id from messages`)).rows).toEqual([]);
    expect((await app.query(`select id from agent_runs`)).rows).toEqual([]);
    expect((await app.query(`select run_id from run_events`)).rows).toEqual([]);
  });

  it("lists and reads only the actor's conversations", async () => {
    const alicePage = await repository.list({
      userId: aliceId,
      status: "active",
      cursor: null,
      limit: 10
    });
    expect(alicePage.conversations.map((conversation) => conversation.id)).toContain(
      aliceConversationId
    );
    expect(alicePage.conversations.map((conversation) => conversation.id)).not.toContain(
      bobConversationId
    );
    await expect(repository.getDetail(aliceId, bobConversationId)).resolves.toBeNull();
    await expect(
      repository.listRunEvents({
        userId: aliceId,
        conversationId: bobConversationId,
        runId: randomUUID(),
        afterSequence: 0,
        limit: 100
      })
    ).resolves.toBeNull();
  });

  it("rejects cross-user inserts and hides Bob from Alice updates and deletes", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `insert into conversations
               (id, user_id, title, status, last_activity_at)
             values ($1, $2, 'Cross tenant', 'active', $3)`,
            [randomUUID(), bobId, now]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `insert into messages
               (id, user_id, conversation_id, sequence, role, status,
                content_parts, created_at, finalized_at)
             values ($1, $2, $3, 1, 'user', 'final', $4::jsonb, $5, $5)`,
            [
              randomUUID(),
              aliceId,
              bobConversationId,
              JSON.stringify(textContent("Cross tenant")),
              now
            ]
          )
        )
      ).rejects.toMatchObject({ code: "23503" });

      const updated = await asActor(client, aliceId, () =>
        client.query(`update conversations set title = 'Stolen' where id = $1`, [
          bobConversationId
        ])
      );
      const deleted = await asActor(client, aliceId, () =>
        client.query(`delete from conversations where id = $1`, [bobConversationId])
      );
      expect(updated.rowCount).toBe(0);
      expect(deleted.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("enforces idempotency, one active run, durable event order, and replay", async () => {
    const conversationId = randomUUID();
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );
    const clientRequestId = randomUUID();
    const input = {
      userId: aliceId,
      conversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId,
      content: "Compare revenue by country",
      correlationId: randomUUID(),
      occurredAt: now
    };
    const submitted = await repository.enqueueMessage(input);
    expect(submitted.replayed).toBe(false);
    await expect(
      repository.enqueueMessage({
        ...input,
        messageId: randomUUID(),
        runId: randomUUID()
      })
    ).resolves.toEqual({ ...submitted, replayed: true });
    await expect(
      repository.enqueueMessage({
        ...input,
        messageId: randomUUID(),
        runId: randomUUID(),
        content: "Different content"
      })
    ).rejects.toMatchObject({ code: "CONVERSATION_REQUEST_ID_REUSED" });
    await expect(
      repository.enqueueMessage({
        ...input,
        messageId: randomUUID(),
        runId: randomUUID(),
        clientRequestId: randomUUID()
      })
    ).rejects.toMatchObject({ code: "CONVERSATION_RUN_ACTIVE" });

    const work = await repository.claimRun({
      userId: aliceId,
      conversationId,
      runId: submitted.runId,
      occurredAt: new Date(now.getTime() + 1000)
    });
    expect(work).toMatchObject({ content: input.content, userId: aliceId });
    await expect(
      repository.claimRun({
        userId: aliceId,
        conversationId,
        runId: submitted.runId,
        occurredAt: new Date(now.getTime() + 1500)
      })
    ).resolves.toBeNull();
    const assistantMessageId = randomUUID();
    await repository.completeRun({
      userId: aliceId,
      conversationId,
      runId: submitted.runId,
      assistantMessageId,
      assistantText: "Revenue is ready for analysis.",
      generatedTitle: "Compare revenue by country",
      occurredAt: new Date(now.getTime() + 2000)
    });

    const detail = await repository.getDetail(aliceId, conversationId);
    expect(detail).toMatchObject({
      conversation: {
        title: "Compare revenue by country",
        lastMessageSequence: 2
      },
      activeRun: null
    });
    expect(detail?.messages.map((message) => [message.sequence, message.role])).toEqual([
      [1, "user"],
      [2, "assistant"]
    ]);
    const allEvents = await repository.listRunEvents({
      userId: aliceId,
      conversationId,
      runId: submitted.runId,
      afterSequence: 0,
      limit: 100
    });
    expect(allEvents?.events.map((event) => [event.sequence, event.type])).toEqual([
      [1, "run.queued"],
      [2, "run.started"],
      [3, "assistant.delta"],
      [4, "run.completed"]
    ]);
    const replay = await repository.listRunEvents({
      userId: aliceId,
      conversationId,
      runId: submitted.runId,
      afterSequence: 2,
      limit: 100
    });
    expect(replay?.events.map((event) => event.sequence)).toEqual([3, 4]);
  });

  it("keeps finalized messages and run events immutable to the application role", async () => {
    const conversationId = randomUUID();
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );
    const submission = await repository.enqueueMessage({
      userId: aliceId,
      conversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "Immutable content",
      correlationId: randomUUID(),
      occurredAt: now
    });
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(`update messages set content_parts = $1::jsonb`, [
            JSON.stringify(textContent("Changed"))
          ])
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () => client.query(`delete from messages`))
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () =>
          client.query(`update run_events set event_type = 'run.failed'`)
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
    }
    await repository.cancelRun({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      occurredAt: new Date(now.getTime() + 1000)
    });
  });

  it("persists cancellation and prevents a cancelled job from restarting", async () => {
    const conversationId = randomUUID();
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );
    const submission = await repository.enqueueMessage({
      userId: aliceId,
      conversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "Cancel this run",
      correlationId: randomUUID(),
      occurredAt: now
    });
    const cancelled = await repository.cancelRun({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      occurredAt: new Date(now.getTime() + 1000)
    });
    expect(cancelled?.status).toBe("cancelled");
    await expect(
      repository.claimRun({
        userId: aliceId,
        conversationId,
        runId: submission.runId,
        occurredAt: new Date(now.getTime() + 2000)
      })
    ).resolves.toBeNull();
    const events = await repository.listRunEvents({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      afterSequence: 0,
      limit: 100
    });
    expect(events?.events.map((event) => event.type)).toEqual([
      "run.queued",
      "run.cancelled"
    ]);
  });

  it("uses stable cursor pagination for a user's conversation list", async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    await repository.create(
      Conversation.create({
        id: firstId,
        userId: aliceId,
        title: "Older",
        now: new Date(now.getTime() + 3000)
      }).toPrimitives()
    );
    await repository.create(
      Conversation.create({
        id: secondId,
        userId: aliceId,
        title: "Newer",
        now: new Date(now.getTime() + 4000)
      }).toPrimitives()
    );
    const firstPage = await repository.list({
      userId: aliceId,
      status: "active",
      cursor: null,
      limit: 1
    });
    expect(firstPage.conversations).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await repository.list({
      userId: aliceId,
      status: "active",
      cursor: firstPage.nextCursor,
      limit: 1
    });
    expect(secondPage.conversations).toHaveLength(1);
    expect(secondPage.conversations[0]?.id).not.toBe(firstPage.conversations[0]?.id);
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
    "$argon2id$phase4-fixture",
    tokenHash,
    expiry
  ]);
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

function textContent(text: string) {
  return { version: 1, parts: [{ type: "text", text }] };
}
