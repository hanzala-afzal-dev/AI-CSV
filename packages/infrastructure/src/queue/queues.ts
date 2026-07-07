import { Queue } from "bullmq";
import type { JobsOptions, QueueOptions } from "bullmq";
import type { DatasetIngestionJobPayload } from "@agentic-csv/contracts";
import type { AppEnv } from "../config/env";
import { createBullMqConnectionOptions } from "../redis/client";

export const queueNames = {
  datasetIngestion: "dataset-ingestion",
  knowledgeIndexing: "knowledge-indexing",
  outboxPublishing: "outbox-publishing"
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export function defaultJobOptions(env: AppEnv): JobsOptions {
  return {
    attempts: env.QUEUE_JOB_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: env.QUEUE_BACKOFF_DELAY_MS
    },
    removeOnComplete: {
      age: 60 * 60,
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5000
    }
  };
}

export function queueOptions(env: AppEnv): QueueOptions {
  return {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: defaultJobOptions(env)
  };
}

export function createDatasetIngestionQueue(env: AppEnv) {
  return new Queue<DatasetIngestionJobPayload>(
    queueNames.datasetIngestion,
    queueOptions(env)
  );
}
