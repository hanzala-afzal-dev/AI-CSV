import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { createDatabaseClient, PostgresMemoryRepository } from "../../src";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("memory repository and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const repository = new PostgresMemoryRepository(createDatabaseClient(app));
  const aliceId = randomUUID();
  const bobId = randomUUID();
  const aliceDatasetId = randomUUID();
  const bobDatasetId = randomUUID();
  const aliceV1 = randomUUID();
  const aliceV2 = randomUUID();
  const bobV1 = randomUUID();
  const aliceConversationId = randomUUID();
  const bobConversationId = randomUUID();
  const aliceMessageId = randomUUID();
  const bobMessageId = randomUUID();
  const aliceRunId = randomUUID();
  const bobRunId = randomUUID();
  const aliceClarificationId = randomUUID();
  const bobClarificationId = randomUUID();
  const aliceMemoryId = randomUUID();
  const bobMemoryId = randomUUID();
  const aliceColumnId = randomUUID();
  const bobColumnId = randomUUID();

  beforeAll(async () => {
    await admin.query(
      `insert into users (id, display_name)
       values ($1, 'Alice memory'), ($2, 'Bob memory')`,
      [aliceId, bobId]
    );
    await admin.query(
      `insert into datasets (id, user_id, name, original_filename)
       values ($1, $2, 'Alice sales', 'alice.csv'),
              ($3, $4, 'Bob sales', 'bob.csv')`,
      [aliceDatasetId, aliceId, bobDatasetId, bobId]
    );
    await admin.query(
      `insert into dataset_versions
         (id, user_id, dataset_id, version_number, original_filename, mime_type,
          object_key, size_bytes, checksum)
       values ($1, $2, $3, 1, 'alice.csv', 'text/csv', $4, 10, $5),
              ($6, $2, $3, 2, 'alice-v2.csv', 'text/csv', $7, 10, $5),
              ($8, $9, $10, 1, 'bob.csv', 'text/csv', $11, 10, $5)`,
      [
        aliceV1,
        aliceId,
        aliceDatasetId,
        `users/${aliceId}/datasets/${aliceDatasetId}/versions/${aliceV1}/original.csv`,
        "a".repeat(64),
        aliceV2,
        `users/${aliceId}/datasets/${aliceDatasetId}/versions/${aliceV2}/original.csv`,
        bobV1,
        bobId,
        bobDatasetId,
        `users/${bobId}/datasets/${bobDatasetId}/versions/${bobV1}/original.csv`
      ]
    );
    await admin.query(
      `insert into conversations (id, user_id, title)
       values ($1, $2, 'Alice memory source'), ($3, $4, 'Bob memory source')`,
      [aliceConversationId, aliceId, bobConversationId, bobId]
    );
    await admin.query(
      `insert into messages
         (id, user_id, conversation_id, sequence, role, status, content_parts,
          created_at, finalized_at)
       values ($1, $2, $3, 1, 'user', 'final', $4::jsonb, now(), now()),
              ($5, $6, $7, 1, 'user', 'final', $4::jsonb, now(), now())`,
      [
        aliceMessageId,
        aliceId,
        aliceConversationId,
        JSON.stringify({ version: 1, parts: [{ type: "text", text: "net revenue" }] }),
        bobMessageId,
        bobId,
        bobConversationId
      ]
    );
    await admin.query(
      `insert into agent_runs
         (id, user_id, conversation_id, user_message_id, status, client_request_id,
          completed_at)
       values ($1, $2, $3, $4, 'completed', $5, now()),
              ($6, $7, $8, $9, 'completed', $10, now())`,
      [
        aliceRunId,
        aliceId,
        aliceConversationId,
        aliceMessageId,
        randomUUID(),
        bobRunId,
        bobId,
        bobConversationId,
        bobMessageId,
        randomUUID()
      ]
    );
    await admin.query(
      `insert into agent_clarifications
         (id, user_id, conversation_id, run_id, question, options, status, answer,
          answer_message_id, asked_at, answered_at)
       values ($1, $2, $3, $4, $5, '[]'::jsonb, 'answered', 'net_revenue', $6, now(), now()),
              ($7, $8, $9, $10, $5, '[]'::jsonb, 'answered', 'gross_revenue', $11, now(), now())`,
      [
        aliceClarificationId,
        aliceId,
        aliceConversationId,
        aliceRunId,
        "Which revenue definition should be used for this analysis?",
        aliceMessageId,
        bobClarificationId,
        bobId,
        bobConversationId,
        bobRunId,
        bobMessageId
      ]
    );
    await insertMemory({
      id: aliceMemoryId,
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceV1,
      conversationId: aliceConversationId,
      messageId: aliceMessageId,
      clarificationId: aliceClarificationId,
      columnId: aliceColumnId,
      columnName: "net_revenue"
    });
    await insertMemory({
      id: bobMemoryId,
      userId: bobId,
      datasetId: bobDatasetId,
      datasetVersionId: bobV1,
      conversationId: bobConversationId,
      messageId: bobMessageId,
      clarificationId: bobClarificationId,
      columnId: bobColumnId,
      columnName: "gross_revenue"
    });
    await admin.query(
      `insert into memory_context_heads
         (user_id, dataset_id, dataset_version_id, revision)
       values ($1, $2, $3, 3), ($4, $5, $6, 7)`,
      [aliceId, aliceDatasetId, aliceV1, bobId, bobDatasetId, bobV1]
    );
    await admin.query(
      `insert into semantic_documents
         (user_id, dataset_id, dataset_version_id, source_id, document_type,
          content, content_hash, index_status)
       values ($1, $2, $3, $4, 'dataset_description', 'Alice columns', $5, 'indexed'),
              ($6, $7, $8, $9, 'dataset_description', 'Bob private columns', $10, 'indexed')`,
      [
        aliceId,
        aliceDatasetId,
        aliceV1,
        aliceV1,
        "c".repeat(64),
        bobId,
        bobDatasetId,
        bobV1,
        bobV1,
        "d".repeat(64)
      ]
    );
  });

  afterAll(async () => {
    await admin.query(`delete from users where id = any($1::uuid[])`, [[aliceId, bobId]]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("fails closed without actor context and shows only Alice rows to Alice", async () => {
    expect((await app.query(`select id from memory_records`)).rows).toEqual([]);
    expect((await app.query(`select id from semantic_documents`)).rows).toEqual([]);
    expect((await app.query(`select revision from memory_context_heads`)).rows).toEqual(
      []
    );

    const client = await app.connect();
    try {
      const visible = await asActor(client, aliceId, async () => ({
        memories: (await client.query(`select id from memory_records`)).rows,
        documents: (await client.query(`select content from semantic_documents`)).rows,
        heads: (await client.query(`select revision from memory_context_heads`)).rows
      }));
      expect(visible).toEqual({
        memories: [{ id: aliceMemoryId }],
        documents: [{ content: "Alice columns" }],
        heads: [{ revision: 3 }]
      });
    } finally {
      client.release();
    }
  });

  it("keeps definitions tenant and version scoped at the repository boundary", async () => {
    const v1 = await repository.findConfirmedDefinitions({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceV1
    });
    const v2 = await repository.findConfirmedDefinitions({
      userId: aliceId,
      datasetId: aliceDatasetId,
      datasetVersionId: aliceV2
    });
    const guessedBob = await repository.findConfirmedDefinitions({
      userId: aliceId,
      datasetId: bobDatasetId,
      datasetVersionId: bobV1
    });

    expect(v1).toEqual([
      expect.objectContaining({
        sourceId: aliceMessageId,
        definition: expect.objectContaining({ columnName: "net_revenue" })
      })
    ]);
    expect(v2).toEqual([]);
    expect(guessedBob).toEqual([]);
  });

  it("rejects forged ownership and keeps tenant keys immutable", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, aliceId, () =>
          client.query(
            `insert into memory_context_heads
               (user_id, dataset_id, dataset_version_id, revision)
             values ($1, $2, $3, 1)`,
            [bobId, bobDatasetId, bobV1]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asActor(client, aliceId, () =>
          client.query(`update memory_records set user_id = $1 where id = $2`, [
            bobId,
            aliceMemoryId
          ])
        )
      ).rejects.toMatchObject({ code: "42501" });
      const hidden = await asActor(client, aliceId, () =>
        client.query(`update memory_records set index_status = 'failed' where id = $1`, [
          bobMemoryId
        ])
      );
      expect(hidden.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  async function insertMemory(input: {
    readonly id: string;
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly conversationId: string;
    readonly messageId: string;
    readonly clarificationId: string;
    readonly columnId: string;
    readonly columnName: string;
  }): Promise<void> {
    const content = `Confirmed dataset definition: revenue means ${input.columnName}.`;
    await admin.query(
      `insert into memory_records
         (id, user_id, dataset_id, dataset_version_id, conversation_id,
          source_message_id, source_clarification_id, kind, confidence,
          definition_key, content, definition, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, 'definition', 'confirmed',
               'revenue', $8, $9::jsonb, $10)`,
      [
        input.id,
        input.userId,
        input.datasetId,
        input.datasetVersionId,
        input.conversationId,
        input.messageId,
        input.clarificationId,
        content,
        JSON.stringify({
          version: 1,
          alias: "revenue",
          columnId: input.columnId,
          columnName: input.columnName,
          clarificationId: input.clarificationId,
          sourceMessageId: input.messageId
        }),
        input.userId === aliceId ? "a".repeat(64) : "b".repeat(64)
      ]
    );
  }
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
