import { and, eq, sql } from "drizzle-orm";
import {
  AgentError,
  type AgentCheckpointRecord,
  type AgentCheckpointRepository
} from "@agentic-csv/application";
import { agentAnalysisStateSchema } from "@agentic-csv/contracts";
import { createUuidV7 } from "@agentic-csv/domain";
import { agentCheckpoints } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresAgentCheckpointRepository implements AgentCheckpointRepository {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly createId: () => string = createUuidV7
  ) {}

  public load(
    input: Parameters<AgentCheckpointRepository["load"]>[0]
  ): Promise<AgentCheckpointRecord | null> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(agentCheckpoints)
        .where(
          and(
            eq(agentCheckpoints.userId, input.userId),
            eq(agentCheckpoints.conversationId, input.conversationId),
            eq(agentCheckpoints.runId, input.runId)
          )
        )
        .limit(1);
      return row
        ? { state: agentAnalysisStateSchema.parse(row.state), revision: row.revision }
        : null;
    });
  }

  public save(
    input: Parameters<AgentCheckpointRepository["save"]>[0]
  ): Promise<AgentCheckpointRecord> {
    const state = agentAnalysisStateSchema.parse(input.state);
    return this.executeForUser(state.userId, async (transaction) => {
      if (input.expectedRevision === null) {
        try {
          const [created] = await transaction
            .insert(agentCheckpoints)
            .values({
              id: this.createId(),
              userId: state.userId,
              conversationId: state.conversationId,
              runId: state.runId,
              revision: 1,
              state,
              createdAt: new Date(state.updatedAt),
              updatedAt: new Date(state.updatedAt)
            })
            .returning();
          if (created) return { state, revision: created.revision };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
        throw checkpointConflict();
      }
      const nextRevision = input.expectedRevision + 1;
      const [updated] = await transaction
        .update(agentCheckpoints)
        .set({
          state,
          revision: nextRevision,
          updatedAt: new Date(state.updatedAt)
        })
        .where(
          and(
            eq(agentCheckpoints.userId, state.userId),
            eq(agentCheckpoints.conversationId, state.conversationId),
            eq(agentCheckpoints.runId, state.runId),
            eq(agentCheckpoints.revision, input.expectedRevision)
          )
        )
        .returning({ revision: agentCheckpoints.revision });
      if (!updated) throw checkpointConflict();
      return { state, revision: updated.revision };
    });
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

function checkpointConflict(): AgentError {
  return new AgentError(
    "AGENT_CHECKPOINT_INVALID",
    "The analytical checkpoint changed unexpectedly."
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
