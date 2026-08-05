import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import type {
  AnalysisContextResult,
  CompletedAnalysis,
  ConversationRepository
} from "@agentic-csv/application";
import { Conversation } from "@agentic-csv/domain";
import {
  createDatabaseClient,
  PostgresAnalysisRepository,
  PostgresConversationRepository
} from "../../src";

const applicationUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const describeIntegration = applicationUrl && migrationUrl ? describe : describe.skip;

describeIntegration("analysis artifact persistence and RLS", () => {
  const admin = new Pool({ connectionString: migrationUrl });
  const app = new Pool({ connectionString: applicationUrl });
  const database = createDatabaseClient(app);
  const conversations = new PostgresConversationRepository(database);
  const analyses = new PostgresAnalysisRepository(database);
  const alice = fixtureIdentity("alice.phase6@example.com");
  const bob = fixtureIdentity("bob.phase6@example.com");
  const constraintConversationId = randomUUID();
  const now = new Date("2026-08-05T12:00:00.000Z");
  let aliceRun: PreparedRun;
  let bobRun: PreparedRun;
  let constraintRun: PreparedRun;
  let aliceContext: AnalysisContextResult;
  let bobReadingAliceContext: AnalysisContextResult;

  beforeAll(async () => {
    await admin.query(
      `insert into users (id, display_name)
       values ($1, 'Alice Phase 6'), ($2, 'Bob Phase 6')`,
      [alice.userId, bob.userId]
    );
    await insertDataset(admin, alice);
    await insertDataset(admin, bob);
    for (const fixture of [alice, bob]) {
      await conversations.create(
        Conversation.create({
          id: fixture.conversationId,
          userId: fixture.userId,
          title: `${fixture.email} analysis`,
          now
        }).toPrimitives()
      );
      await expect(
        conversations.attachDatasetVersion({
          userId: fixture.userId,
          conversationId: fixture.conversationId,
          datasetVersionId: fixture.datasetVersionId,
          occurredAt: now
        })
      ).resolves.toMatchObject({ state: "attached" });
    }
    await conversations.create(
      Conversation.create({
        id: constraintConversationId,
        userId: alice.userId,
        title: "Composite ownership fixture",
        now
      }).toPrimitives()
    );

    aliceRun = await prepareRun(conversations, alice.userId, alice.conversationId, now);
    bobRun = await prepareRun(conversations, bob.userId, bob.conversationId, now);
    constraintRun = await prepareRun(
      conversations,
      alice.userId,
      constraintConversationId,
      now
    );
    aliceContext = await analyses.loadRunContext({
      userId: alice.userId,
      conversationId: alice.conversationId,
      runId: aliceRun.runId
    });
    bobReadingAliceContext = await analyses.loadRunContext({
      userId: bob.userId,
      conversationId: alice.conversationId,
      runId: aliceRun.runId
    });

    await conversations.completeRun({
      userId: alice.userId,
      conversationId: alice.conversationId,
      runId: aliceRun.runId,
      assistantMessageId: aliceRun.assistantMessageId,
      assistantText: "Alice revenue totals are ready.",
      analysis: analysisFixture(alice, aliceRun),
      generatedTitle: "Revenue by country",
      occurredAt: new Date(now.getTime() + 1_000)
    });
    await conversations.completeRun({
      userId: bob.userId,
      conversationId: bob.conversationId,
      runId: bobRun.runId,
      assistantMessageId: bobRun.assistantMessageId,
      assistantText: "Bob revenue totals are ready.",
      analysis: analysisFixture(bob, bobRun),
      generatedTitle: "Revenue by country",
      occurredAt: new Date(now.getTime() + 1_000)
    });
  });

  afterAll(async () => {
    const userIds = [alice.userId, bob.userId];
    await admin.query(
      `update conversations
       set active_dataset_id = null, active_dataset_version_id = null
       where user_id = any($1::uuid[])`,
      [userIds]
    );
    await admin.query(
      `update datasets set active_version_id = null
       where user_id = any($1::uuid[])`,
      [userIds]
    );
    await admin.query(`delete from conversations where user_id = any($1::uuid[])`, [
      userIds
    ]);
    await admin.query(`delete from dataset_versions where user_id = any($1::uuid[])`, [
      userIds
    ]);
    await admin.query(`delete from datasets where user_id = any($1::uuid[])`, [userIds]);
    await admin.query(`delete from users where id = any($1::uuid[])`, [userIds]);
    await Promise.all([admin.end(), app.end()]);
  });

  it("loads only the authorized immutable dataset relation", () => {
    expect(aliceContext).toMatchObject({
      state: "ready",
      context: {
        userId: alice.userId,
        datasetId: alice.datasetId,
        datasetVersionId: alice.datasetVersionId,
        objectKey: alice.objectKey,
        columns: [
          { id: alice.countryColumnId, canonicalName: "country" },
          { id: alice.revenueColumnId, canonicalName: "revenue" }
        ]
      }
    });
    expect(bobReadingAliceContext).toEqual({ state: "no_dataset" });
  });

  it("atomically persists and reloads only the owner's result and chart", async () => {
    const aliceArtifact = await analyses.getArtifact(alice.userId, aliceRun.resultId);
    const bobArtifact = await analyses.getArtifact(bob.userId, bobRun.resultId);

    expect(aliceArtifact).toMatchObject({
      messageId: aliceRun.assistantMessageId,
      result: {
        id: aliceRun.resultId,
        planId: aliceRun.planId,
        datasetVersionId: alice.datasetVersionId,
        planHash: analysisFixture(alice, aliceRun).planHash,
        rows: [{ dimension_1: "DE", measure_1: 120 }]
      },
      chart: {
        id: aliceRun.chartArtifactId,
        resultArtifactId: aliceRun.resultId,
        spec: { type: "bar" }
      }
    });
    expect(bobArtifact?.result.id).toBe(bobRun.resultId);
    await expect(analyses.getArtifact(alice.userId, bobRun.resultId)).resolves.toBeNull();
    await expect(analyses.getArtifact(bob.userId, aliceRun.resultId)).resolves.toBeNull();

    const detail = await conversations.getDetail(alice.userId, alice.conversationId);
    expect(detail?.messages.at(-1)?.content.parts).toEqual([
      { type: "text", text: "Alice revenue totals are ready." },
      {
        type: "analysis",
        resultId: aliceRun.resultId,
        chartArtifactId: aliceRun.chartArtifactId
      }
    ]);
  });

  it("fails closed without actor context on every Phase 6 tenant table", async () => {
    expect((await app.query(`select id from analysis_plans`)).rows).toEqual([]);
    expect((await app.query(`select id from analysis_results`)).rows).toEqual([]);
    expect((await app.query(`select id from chart_artifacts`)).rows).toEqual([]);
  });

  it("rejects cross-owner dataset references and ownership mass assignment", async () => {
    const client = await app.connect();
    try {
      await expect(
        asActor(client, alice.userId, () =>
          insertPlan(client, {
            id: randomUUID(),
            userId: alice.userId,
            conversationId: constraintConversationId,
            runId: constraintRun.runId,
            datasetId: bob.datasetId,
            datasetVersionId: bob.datasetVersionId,
            fixture: alice
          })
        )
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        asActor(client, alice.userId, () =>
          insertPlan(client, {
            id: randomUUID(),
            userId: bob.userId,
            conversationId: bob.conversationId,
            runId: bobRun.runId,
            datasetId: bob.datasetId,
            datasetVersionId: bob.datasetVersionId,
            fixture: bob
          })
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
    }
  });

  it("keeps completed plans, results, and charts immutable to the app role", async () => {
    const client = await app.connect();
    try {
      for (const statement of [
        `update analysis_plans set validation_status = 'invalid'`,
        `delete from analysis_results`,
        `update chart_artifacts set schema_version = 2`
      ]) {
        await expect(
          asActor(client, alice.userId, () => client.query(statement))
        ).rejects.toMatchObject({ code: "42501" });
      }
    } finally {
      client.release();
    }
  });
});

interface FixtureIdentity {
  readonly email: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly countryColumnId: string;
  readonly revenueColumnId: string;
  readonly objectKey: string;
}

interface PreparedRun {
  readonly runId: string;
  readonly assistantMessageId: string;
  readonly planId: string;
  readonly resultId: string;
  readonly chartArtifactId: string;
}

function fixtureIdentity(email: string): FixtureIdentity {
  const userId = randomUUID();
  const datasetId = randomUUID();
  const datasetVersionId = randomUUID();
  return {
    email,
    userId,
    conversationId: randomUUID(),
    datasetId,
    datasetVersionId,
    countryColumnId: randomUUID(),
    revenueColumnId: randomUUID(),
    objectKey: `users/${userId}/datasets/${datasetId}/versions/${datasetVersionId}/original.csv`
  };
}

async function insertDataset(pool: Pool, fixture: FixtureIdentity): Promise<void> {
  const checksum = "A".repeat(43) + "=";
  await pool.query(
    `insert into datasets
       (id, user_id, name, original_filename, status, object_key, row_count, column_count)
     values ($1, $2, 'Revenue', 'revenue.csv', 'ready', $3, 1, 2)`,
    [fixture.datasetId, fixture.userId, fixture.objectKey]
  );
  await pool.query(
    `insert into dataset_versions
       (id, user_id, dataset_id, version_number, original_filename, mime_type,
        encoding, delimiter, object_key, size_bytes, checksum, status, row_count,
        column_count, profile_version)
     values ($1, $2, $3, 1, 'revenue.csv', 'text/csv', 'utf-8', ',', $4,
             24, $5, 'ready', 1, 2, 1)`,
    [
      fixture.datasetVersionId,
      fixture.userId,
      fixture.datasetId,
      fixture.objectKey,
      checksum
    ]
  );
  await pool.query(
    `insert into dataset_columns
       (id, user_id, dataset_id, dataset_version_id, ordinal, original_name,
        canonical_name, inferred_type, semantic_type, nullable, statistics)
     values ($1, $2, $3, $4, 0, 'country', 'country', 'text', 'categorical', false,
             $5::jsonb),
            ($6, $2, $3, $4, 1, 'revenue', 'revenue', 'decimal', 'numeric', false,
             $7::jsonb)`,
    [
      fixture.countryColumnId,
      fixture.userId,
      fixture.datasetId,
      fixture.datasetVersionId,
      JSON.stringify({ version: 1, nullCount: 0, distinctCount: 1 }),
      fixture.revenueColumnId,
      JSON.stringify({ version: 1, nullCount: 0, min: 120, max: 120 })
    ]
  );
  await pool.query(`update datasets set active_version_id = $1 where id = $2`, [
    fixture.datasetVersionId,
    fixture.datasetId
  ]);
}

async function prepareRun(
  repository: ConversationRepository,
  userId: string,
  conversationId: string,
  occurredAt: Date
): Promise<PreparedRun> {
  const runId = randomUUID();
  await repository.enqueueMessage({
    userId,
    conversationId,
    messageId: randomUUID(),
    runId,
    clientRequestId: randomUUID(),
    content: "Compare revenue by country",
    correlationId: randomUUID(),
    occurredAt
  });
  await expect(
    repository.claimRun({ userId, conversationId, runId, occurredAt })
  ).resolves.toMatchObject({ runId });
  return {
    runId,
    assistantMessageId: randomUUID(),
    planId: randomUUID(),
    resultId: randomUUID(),
    chartArtifactId: randomUUID()
  };
}

function analysisFixture(fixture: FixtureIdentity, run: PreparedRun): CompletedAnalysis {
  const plan = {
    version: 1 as const,
    operation: "compare" as const,
    dimensions: [{ columnId: fixture.countryColumnId }],
    measures: [{ columnId: fixture.revenueColumnId, aggregation: "sum" as const }],
    filters: [],
    sort: [{ target: "measure" as const, index: 0, direction: "desc" as const }],
    limit: 10,
    visualizationPreference: "bar" as const,
    assumptions: []
  };
  const planHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  return {
    planId: run.planId,
    resultId: run.resultId,
    chartArtifactId: run.chartArtifactId,
    datasetId: fixture.datasetId,
    datasetVersionId: fixture.datasetVersionId,
    plan,
    planHash,
    schema: [
      { field: "dimension_1", label: "Country", dataType: "category" },
      { field: "measure_1", label: "Revenue sum", dataType: "number" }
    ],
    rows: [{ dimension_1: "DE", measure_1: 120 }],
    rowCount: 1,
    truncated: false,
    executionMs: 12,
    checksum: createHash("sha256").update(`${fixture.userId}:result`).digest("hex"),
    provenance: {
      version: 1,
      datasetId: fixture.datasetId,
      datasetVersionId: fixture.datasetVersionId,
      columnIds: [fixture.countryColumnId, fixture.revenueColumnId],
      aggregations: ["sum"],
      filters: [],
      timeGrain: null,
      resultRowCount: 1,
      truncated: false,
      assumptions: [],
      warnings: []
    },
    chartSpec: {
      version: 1,
      type: "bar",
      title: "Revenue by country",
      x: { field: "dimension_1", label: "Country", dataType: "category" },
      series: [{ field: "measure_1", label: "Revenue sum" }],
      categoryField: "dimension_1",
      footnotes: []
    },
    createdAt: new Date("2026-08-05T12:00:01.000Z")
  };
}

function insertPlan(
  client: PoolClient,
  input: {
    readonly id: string;
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly fixture: FixtureIdentity;
  }
) {
  const analysis = analysisFixture(input.fixture, {
    runId: input.runId,
    assistantMessageId: randomUUID(),
    planId: input.id,
    resultId: randomUUID(),
    chartArtifactId: randomUUID()
  });
  return client.query(
    `insert into analysis_plans
       (id, user_id, conversation_id, run_id, dataset_id, dataset_version_id,
        plan, plan_hash, validation_status)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'validated')`,
    [
      input.id,
      input.userId,
      input.conversationId,
      input.runId,
      input.datasetId,
      input.datasetVersionId,
      JSON.stringify(analysis.plan),
      analysis.planHash
    ]
  );
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
