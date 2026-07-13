import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  agentRunJobPayloadSchema,
  datasetIngestionJobPayloadSchema
} from "@agentic-csv/contracts";
import { outboxEvents } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";
import type { AppLogger } from "../logging/logger";
import { createAgentRunQueue, createDatasetIngestionQueue } from "./queues";
import type { AppEnv } from "../config/env";

export class OutboxDispatcher {
  private readonly datasetQueue;
  private readonly agentRunQueue;

  public constructor(
    private readonly database: DatabaseClient,
    env: AppEnv,
    private readonly logger: AppLogger
  ) {
    this.datasetQueue = createDatasetIngestionQueue(env);
    this.agentRunQueue = createAgentRunQueue(env);
  }

  public async dispatchBatch(limit = 25): Promise<number> {
    const pending = await this.database
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.publishedAt),
          inArray(outboxEvents.eventName, [
            "queue.dataset.ingest.v1",
            "queue.agent.run.v1"
          ])
        )
      )
      .orderBy(asc(outboxEvents.occurredAt))
      .limit(limit);

    let published = 0;
    for (const event of pending) {
      try {
        const payload = parseQueuePayload(event.eventName, event.payload);
        const jobId = createHash("sha256").update(payload.idempotencyKey).digest("hex");
        if (payload.jobName === "agent.run.v1") {
          await this.agentRunQueue.add(payload.jobName, payload, { jobId });
        } else {
          await this.datasetQueue.add(payload.jobName, payload, { jobId });
        }
        await this.database
          .update(outboxEvents)
          .set({ publishedAt: new Date(), attempts: event.attempts + 1, lastError: null })
          .where(
            and(eq(outboxEvents.eventId, event.eventId), isNull(outboxEvents.publishedAt))
          );
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown outbox error";
        await this.database
          .update(outboxEvents)
          .set({ attempts: event.attempts + 1, lastError: message.slice(0, 2000) })
          .where(eq(outboxEvents.eventId, event.eventId));
        this.logger.error(
          { eventId: event.eventId, aggregateId: event.aggregateId, error: message },
          "outbox dispatch failed"
        );
      }
    }
    return published;
  }

  public async close(): Promise<void> {
    await Promise.all([this.datasetQueue.close(), this.agentRunQueue.close()]);
  }
}

function parseQueuePayload(eventName: string, payload: unknown) {
  return eventName === "queue.agent.run.v1"
    ? agentRunJobPayloadSchema.parse(payload)
    : datasetIngestionJobPayloadSchema.parse(payload);
}
