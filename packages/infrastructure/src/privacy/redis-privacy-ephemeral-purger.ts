import type { Job, Queue } from "bullmq";
import type { PrivacyEphemeralPurger } from "@agentic-csv/application";
import type { AppEnv } from "../config/env";
import {
  createAgentRunQueue,
  createDatasetIngestionQueue,
  createKnowledgeDeleteQueue,
  createKnowledgeIndexQueue
} from "../queue/queues";
import type { RedisClient } from "../redis/client";

const removableStates = [
  "wait",
  "paused",
  "delayed",
  "prioritized",
  "waiting-children",
  "failed",
  "completed"
] as const;

export class RedisPrivacyEphemeralPurger implements PrivacyEphemeralPurger {
  private readonly queues: readonly Queue[];

  public constructor(
    private readonly redis: RedisClient,
    private readonly prefix: string,
    env: AppEnv
  ) {
    this.queues = [
      createDatasetIngestionQueue(env),
      createAgentRunQueue(env),
      createKnowledgeIndexQueue(env),
      createKnowledgeDeleteQueue(env)
    ];
  }

  public async deleteDataset(input: {
    readonly userId: string;
    readonly datasetId: string;
  }): Promise<void> {
    await this.deleteRedisKeys(
      `${this.prefix}:memory-context:v1:${input.userId}:${input.datasetId}:*`
    );
    await this.removeJobs(
      (job) =>
        field(job.data, "userId") === input.userId &&
        field(job.data, "datasetId") === input.datasetId
    );
  }

  public async deleteUser(userId: string): Promise<void> {
    await this.deleteRedisKeys(`${this.prefix}:memory-context:v1:${userId}:*`);
    await this.removeJobs((job) => field(job.data, "userId") === userId);
  }

  public async close(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
  }

  private async deleteRedisKeys(pattern: string): Promise<void> {
    if (!this.redis.isOpen) await this.redis.connect();
    for await (const page of this.redis.scanIterator({
      MATCH: pattern,
      COUNT: 250
    })) {
      const keys = Array.isArray(page) ? page : [page];
      if (keys.length > 0) await this.redis.del(keys);
    }
  }

  private async removeJobs(predicate: (job: Job) => boolean): Promise<void> {
    for (const queue of this.queues) {
      const jobs = await queue.getJobs([...removableStates], 0, -1, true);
      for (const job of jobs) {
        if (predicate(job)) await job.remove();
      }
    }
  }
}

function field(value: unknown, name: string): string | null {
  if (typeof value !== "object" || value === null || !(name in value)) return null;
  const fieldValue = (value as Record<string, unknown>)[name];
  return typeof fieldValue === "string" ? fieldValue : null;
}
