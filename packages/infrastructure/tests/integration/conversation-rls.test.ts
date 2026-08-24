import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { agentAnalysisStateSchema } from "@agentic-csv/contracts";
import { Conversation } from "@agentic-csv/domain";
import { createDatabaseClient } from "../../src/database/client";
import { PostgresAgentCheckpointRepository } from "../../src/agents/postgres-agent-checkpoint-repository";
import { PostgresConversationRepository } from "../../src/conversations";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("conversation repository and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const database = createDatabaseClient(app);
  const repository = new PostgresConversationRepository(database);
  const checkpoints = new PostgresAgentCheckpointRepository(database);
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
    expect((await app.query(`select id from agent_checkpoints`)).rows).toEqual([]);
    expect((await app.query(`select id from agent_clarifications`)).rows).toEqual([]);
  });

  it("isolates Phase 7 checkpoints and clarifications and keeps ownership immutable", async () => {
    const aliceRun = await repository.enqueueMessage({
      userId: aliceId,
      conversationId: aliceConversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "Alice analysis",
      correlationId: randomUUID(),
      occurredAt: now
    });
    const bobRun = await repository.enqueueMessage({
      userId: bobId,
      conversationId: bobConversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "Bob analysis",
      correlationId: randomUUID(),
      occurredAt: now
    });
    const aliceCheckpointId = randomUUID();
    const bobCheckpointId = randomUUID();
    const aliceClarificationId = randomUUID();
    const bobClarificationId = randomUUID();
    await admin.query(
      `insert into agent_checkpoints
         (id, user_id, conversation_id, run_id, state)
       values ($1, $2, $3, $4, $5::jsonb), ($6, $7, $8, $9, $10::jsonb)`,
      [
        aliceCheckpointId,
        aliceId,
        aliceConversationId,
        aliceRun.runId,
        JSON.stringify(checkpointState(aliceId, aliceConversationId, aliceRun.runId)),
        bobCheckpointId,
        bobId,
        bobConversationId,
        bobRun.runId,
        JSON.stringify(checkpointState(bobId, bobConversationId, bobRun.runId))
      ]
    );
    await admin.query(
      `insert into agent_clarifications
         (id, user_id, conversation_id, run_id, question, options, status, asked_at)
       values ($1, $2, $3, $4, 'Alice question', '[]'::jsonb, 'pending', $5),
              ($6, $7, $8, $9, 'Bob question', '[]'::jsonb, 'pending', $5)`,
      [
        aliceClarificationId,
        aliceId,
        aliceConversationId,
        aliceRun.runId,
        now,
        bobClarificationId,
        bobId,
        bobConversationId,
        bobRun.runId
      ]
    );

    const client = await app.connect();
    try {
      const checkpoints = await asActor(client, aliceId, () =>
        client.query(`select id from agent_checkpoints order by id`)
      );
      const clarifications = await asActor(client, aliceId, () =>
        client.query(`select id from agent_clarifications order by id`)
      );
      expect(checkpoints.rows).toEqual([{ id: aliceCheckpointId }]);
      expect(clarifications.rows).toEqual([{ id: aliceClarificationId }]);

      const hiddenUpdate = await asActor(client, aliceId, () =>
        client.query(
          `update agent_checkpoints set revision = revision + 1 where id = $1`,
          [bobCheckpointId]
        )
      );
      expect(hiddenUpdate.rowCount).toBe(0);
      await expect(
        asActor(client, aliceId, () =>
          client.query(`update agent_checkpoints set run_id = $1 where id = $2`, [
            randomUUID(),
            aliceCheckpointId
          ])
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `update agent_clarifications set question = 'Changed' where id = $1`,
            [aliceClarificationId]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
    }
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
             values ($1, $2, $3, 999, 'user', 'final', $4::jsonb, $5, $5)`,
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

  it("persists a retryable vector-deletion event before deleting a conversation", async () => {
    const conversationId = randomUUID();
    const correlationId = randomUUID();
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );

    await expect(
      repository.delete({
        userId: aliceId,
        conversationId,
        correlationId,
        occurredAt: now
      })
    ).resolves.toBe(true);

    const event = await admin.query(
      `select event_name, payload from outbox_events
       where user_id = $1 and aggregate_id = $2`,
      [aliceId, conversationId]
    );
    expect(event.rows).toEqual([
      {
        event_name: "queue.knowledge.delete.v1",
        payload: expect.objectContaining({
          userId: aliceId,
          conversationId,
          correlationId,
          scope: "conversation"
        })
      }
    ]);
  });

  it("persists an explicitly confirmed definition and indexing event on resume", async () => {
    const datasetId = randomUUID();
    const datasetVersionId = randomUUID();
    const netRevenueId = randomUUID();
    const grossRevenueId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const clarificationId = randomUUID();
    const memoryId = randomUUID();
    const correlationId = randomUUID();
    await admin.query(
      `insert into datasets
         (id, user_id, name, original_filename, status)
       values ($1, $2, 'Revenue definitions', 'revenue.csv', 'ready')`,
      [datasetId, aliceId]
    );
    await admin.query(
      `insert into dataset_versions
         (id, user_id, dataset_id, version_number, original_filename, mime_type,
          object_key, size_bytes, checksum, status)
       values ($1, $2, $3, 1, 'revenue.csv', 'text/csv', $4, 10, $5, 'ready')`,
      [
        datasetVersionId,
        aliceId,
        datasetId,
        `users/${aliceId}/datasets/${datasetId}/versions/${datasetVersionId}/original.csv`,
        "a".repeat(64)
      ]
    );
    await admin.query(
      `insert into dataset_columns
         (id, user_id, dataset_id, dataset_version_id, ordinal, original_name,
          canonical_name, inferred_type, semantic_type, nullable, statistics)
       values ($1, $2, $3, $4, 0, 'Net revenue', 'net_revenue', 'decimal',
               'numeric', false, $5::jsonb),
              ($6, $2, $3, $4, 1, 'Gross revenue', 'gross_revenue', 'decimal',
               'numeric', false, $5::jsonb)`,
      [
        netRevenueId,
        aliceId,
        datasetId,
        datasetVersionId,
        JSON.stringify({
          version: 1,
          nullCount: 0,
          nullPercentage: 0,
          distinctCount: 1,
          min: "1",
          max: "1",
          mean: 1,
          standardDeviation: 0,
          exampleValues: []
        }),
        grossRevenueId
      ]
    );
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );
    await repository.attachDatasetVersion({
      userId: aliceId,
      conversationId,
      datasetVersionId,
      occurredAt: now
    });
    const submission = await repository.enqueueMessage({
      userId: aliceId,
      conversationId,
      messageId,
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "Revenue by region",
      correlationId,
      occurredAt: now
    });
    await repository.claimRun({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      occurredAt: now
    });
    const clarification = {
      id: clarificationId,
      question: "Which revenue definition should be used for this analysis?",
      options: [
        { value: "net_revenue", label: "Net revenue", columnId: netRevenueId },
        { value: "gross_revenue", label: "Gross revenue", columnId: grossRevenueId }
      ],
      status: "pending" as const,
      answer: null
    };
    await checkpoints.save({
      expectedRevision: null,
      state: agentAnalysisStateSchema.parse({
        version: 1,
        correlationId,
        runId: submission.runId,
        conversationId,
        userId: aliceId,
        userMessageId: messageId,
        question: "Revenue by region",
        phase: "waiting_for_user",
        datasetId,
        datasetVersionId,
        datasetName: "Revenue definitions",
        originalFilename: "revenue.csv",
        columns: [
          {
            id: netRevenueId,
            originalName: "Net revenue",
            canonicalName: "net_revenue",
            inferredType: "decimal",
            semanticType: "numeric",
            nullable: false
          },
          {
            id: grossRevenueId,
            originalName: "Gross revenue",
            canonicalName: "gross_revenue",
            inferredType: "decimal",
            semanticType: "numeric",
            nullable: false
          }
        ],
        retrievedContext: [],
        intent: "aggregation",
        plan: null,
        clarification,
        assumptions: [],
        warnings: [],
        errors: [],
        validationErrors: [],
        selectedModel: "gpt-5.5",
        selectedReasoningEffort: "medium",
        stepCount: 3,
        repairCount: 0,
        toolCallCount: 2,
        updatedAt: now.toISOString()
      })
    });
    await repository.pauseRun({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      clarification,
      metrics: { stepCount: 3, repairCount: 0, toolCallCount: 2 },
      occurredAt: now
    });

    const answerMessageId = randomUUID();
    const resumed = await repository.resumeRun({
      userId: aliceId,
      conversationId,
      runId: submission.runId,
      answerMessageId,
      answer: "net_revenue",
      saveAsDatasetDefinition: true,
      memoryId,
      correlationId,
      occurredAt: new Date(now.getTime() + 1_000)
    });

    expect(resumed?.status).toBe("queued");
    const answerMessage = await admin.query(
      `select content_parts from messages where id = $1`,
      [answerMessageId]
    );
    expect(answerMessage.rows).toEqual([
      {
        content_parts: {
          version: 1,
          parts: [{ type: "text", text: "Net revenue" }]
        }
      }
    ]);
    const persistedClarification = await admin.query(
      `select answer from agent_clarifications where id = $1`,
      [clarificationId]
    );
    expect(persistedClarification.rows).toEqual([{ answer: "net_revenue" }]);
    const persisted = await admin.query(
      `select confidence, definition, source_message_id, source_clarification_id,
              index_status
       from memory_records where id = $1`,
      [memoryId]
    );
    expect(persisted.rows).toEqual([
      {
        confidence: "confirmed",
        definition: expect.objectContaining({
          alias: "revenue",
          columnId: netRevenueId,
          columnName: "net_revenue"
        }),
        source_message_id: expect.any(String),
        source_clarification_id: clarificationId,
        index_status: "pending"
      }
    ]);
    const indexEvent = await admin.query(
      `select payload from outbox_events
       where aggregate_id = $1 and event_name = 'queue.knowledge.index.v1'`,
      [memoryId]
    );
    expect(indexEvent.rows).toEqual([
      {
        payload: expect.objectContaining({
          userId: aliceId,
          datasetId,
          datasetVersionId,
          memoryId,
          source: "confirmed-definition"
        })
      }
    ]);
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

  it("claims only bounded finalized history from the same conversation", async () => {
    const conversationId = randomUUID();
    await repository.create(
      Conversation.create({ id: conversationId, userId: aliceId, now }).toPrimitives()
    );
    for (let turn = 1; turn <= 4; turn += 1) {
      const submitted = await repository.enqueueMessage({
        userId: aliceId,
        conversationId,
        messageId: randomUUID(),
        runId: randomUUID(),
        clientRequestId: randomUUID(),
        content: `User turn ${turn} ${"u".repeat(5_000)}`,
        correlationId: randomUUID(),
        occurredAt: new Date(now.getTime() + turn * 3_000)
      });
      await repository.claimRun({
        userId: aliceId,
        conversationId,
        runId: submitted.runId,
        occurredAt: new Date(now.getTime() + turn * 3_000 + 1_000)
      });
      await repository.completeRun({
        userId: aliceId,
        conversationId,
        runId: submitted.runId,
        assistantMessageId: randomUUID(),
        assistantText: `Assistant turn ${turn} ${"a".repeat(5_000)}`,
        generatedTitle: "Bounded history",
        occurredAt: new Date(now.getTime() + turn * 3_000 + 2_000)
      });
    }
    const second = await repository.enqueueMessage({
      userId: aliceId,
      conversationId,
      messageId: randomUUID(),
      runId: randomUUID(),
      clientRequestId: randomUUID(),
      content: "What was previously done?",
      correlationId: randomUUID(),
      occurredAt: new Date(now.getTime() + 15_000)
    });

    const work = await repository.claimRun({
      userId: aliceId,
      conversationId,
      runId: second.runId,
      occurredAt: new Date(now.getTime() + 16_000)
    });

    expect(work?.conversationHistory).toHaveLength(6);
    expect(work?.conversationHistory.map((message) => message.sequence)).toEqual([
      3, 4, 5, 6, 7, 8
    ]);
    expect(
      work?.conversationHistory.reduce(
        (characters, message) => characters + message.content.length,
        0
      )
    ).toBe(24_000);
    expect(
      work?.conversationHistory.every((message) => message.content.length === 4_000)
    ).toBe(true);
    expect(work?.conversationHistory).not.toContainEqual(
      expect.objectContaining({ content: "What was previously done?" })
    );
    await repository.cancelRun({
      userId: aliceId,
      conversationId,
      runId: second.runId,
      occurredAt: new Date(now.getTime() + 17_000)
    });
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

function checkpointState(userId: string, conversationId: string, runId: string) {
  return { version: 1, userId, conversationId, runId };
}
