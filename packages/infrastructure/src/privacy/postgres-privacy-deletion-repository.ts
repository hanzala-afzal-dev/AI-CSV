import { and, eq, sql } from "drizzle-orm";
import type {
  PrivacyDeletionRepository,
  PrivacyDeletionView,
  PrivacyDeletionWork
} from "@agentic-csv/application";
import {
  privacyDeletionScopeSchema,
  privacyDeletionStatusSchema
} from "@agentic-csv/contracts";
import { privacyDeletionRequests } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresPrivacyDeletionRepository implements PrivacyDeletionRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public scheduleDataset(
    input: Parameters<PrivacyDeletionRepository["scheduleDataset"]>[0]
  ): Promise<PrivacyDeletionView | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const result = await transaction.execute<{ deletion_id: string | null }>(sql`
        select public.privacy_schedule_dataset(
          ${input.deletionId}::uuid,
          ${input.userId}::uuid,
          ${input.datasetId}::uuid,
          ${input.clientRequestId}::uuid,
          ${input.correlationId},
          ${input.requestedAt}
        ) as deletion_id
      `);
      const deletionId = result.rows[0]?.deletion_id;
      return deletionId ? this.readView(transaction, input.userId, deletionId) : null;
    });
  }

  public scheduleAccount(
    input: Parameters<PrivacyDeletionRepository["scheduleAccount"]>[0]
  ): Promise<PrivacyDeletionView> {
    return this.executeForUser(input.userId, async (transaction) => {
      const result = await transaction.execute<{ deletion_id: string }>(sql`
        select public.privacy_schedule_account(
          ${input.deletionId}::uuid,
          ${input.userId}::uuid,
          ${input.clientRequestId}::uuid,
          ${input.correlationId},
          ${input.requestedAt}
        ) as deletion_id
      `);
      const deletionId = result.rows[0]?.deletion_id;
      if (!deletionId) throw new Error("Account deletion could not be scheduled.");
      const deletion = await this.readView(transaction, input.userId, deletionId);
      if (!deletion) throw new Error("Account deletion state was not persisted.");
      return deletion;
    });
  }

  public claim(
    input: Parameters<PrivacyDeletionRepository["claim"]>[0]
  ): Promise<PrivacyDeletionWork | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const result = await transaction.execute<{ claimed: boolean }>(sql`
        select public.privacy_claim(
          ${input.deletionId}::uuid,
          ${input.userId}::uuid,
          ${input.claimedAt}
        ) as claimed
      `);
      if (result.rows[0]?.claimed !== true) return null;
      const [row] = await transaction
        .select()
        .from(privacyDeletionRequests)
        .where(
          and(
            eq(privacyDeletionRequests.userId, input.userId),
            eq(privacyDeletionRequests.id, input.deletionId)
          )
        )
        .limit(1);
      return row
        ? {
            ...mapView(row),
            objectKeys: parseObjectKeys(row.objectKeys)
          }
        : null;
    });
  }

  public complete(
    input: Parameters<PrivacyDeletionRepository["complete"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      await transaction.execute(sql`
        select public.privacy_complete(
          ${input.deletionId}::uuid,
          ${input.userId}::uuid,
          ${input.completedAt}
        )
      `);
    });
  }

  public recordFailure(
    input: Parameters<PrivacyDeletionRepository["recordFailure"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      await transaction.execute(sql`
        select public.privacy_record_failure(
          ${input.deletionId}::uuid,
          ${input.userId}::uuid,
          ${input.failureCode},
          ${input.failedAt}
        )
      `);
    });
  }

  private async readView(
    transaction: DatabaseTransaction,
    userId: string,
    deletionId: string
  ): Promise<PrivacyDeletionView | null> {
    const [row] = await transaction
      .select()
      .from(privacyDeletionRequests)
      .where(
        and(
          eq(privacyDeletionRequests.userId, userId),
          eq(privacyDeletionRequests.id, deletionId)
        )
      )
      .limit(1);
    return row ? mapView(row) : null;
  }

  private executeForUser<TResult>(
    userId: string,
    work: (transaction: DatabaseTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_user_id', ${userId}, true)`
      );
      return work(transaction);
    });
  }
}

function mapView(row: typeof privacyDeletionRequests.$inferSelect): PrivacyDeletionView {
  return {
    id: row.id,
    userId: row.userId,
    scope: privacyDeletionScopeSchema.parse(row.scope),
    datasetId: row.datasetId,
    status: privacyDeletionStatusSchema.parse(row.status),
    requestedAt: row.requestedAt
  };
}

function parseObjectKeys(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Deletion object manifest is invalid.");
  const keys = value.filter(
    (item): item is string => typeof item === "string" && item.startsWith("users/")
  );
  if (keys.length !== value.length) {
    throw new Error("Deletion object manifest contains an invalid key.");
  }
  return keys;
}
