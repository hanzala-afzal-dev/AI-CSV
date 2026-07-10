import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { datasetIngestionJobPayloadSchema } from "@agentic-csv/contracts";
import { outboxEvents } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";
import type { AppLogger } from "../logging/logger";
import { createDatasetIngestionQueue } from "./queues";
import type { AppEnv } from "../config/env";

export class OutboxDispatcher {
  private readonly queue;

  public constructor(
    private readonly database: DatabaseClient,
    env: AppEnv,
    private readonly logger: AppLogger
  ) {
    this.queue = createDatasetIngestionQueue(env);
  }

  public async dispatchBatch(limit = 25): Promise<number> {
    const pending = await this.database
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.publishedAt),
          eq(outboxEvents.eventName, "queue.dataset.ingest.v1")
        )
      )
      .orderBy(asc(outboxEvents.occurredAt))
      .limit(limit);

    let published = 0;
    for (const event of pending) {
      try {
        const payload = datasetIngestionJobPayloadSchema.parse(event.payload);
        const jobId = createHash("sha256").update(payload.idempotencyKey).digest("hex");
        await this.queue.add(payload.jobName, payload, { jobId });
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
    await this.queue.close();
  }
}
