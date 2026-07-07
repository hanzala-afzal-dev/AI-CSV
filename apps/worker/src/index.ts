import { Worker } from "bullmq";
import {
  createBullMqConnectionOptions,
  createLogger,
  loadEnv,
  queueNames
} from "@agentic-csv/infrastructure";
import { processDatasetIngestionJob } from "./processors/dataset-ingestion.processor";

const env = loadEnv();
const logger = createLogger(env).child({ serviceProcess: "worker" });

const datasetWorker = new Worker(
  queueNames.datasetIngestion,
  async (job) => processDatasetIngestionJob(job, logger),
  {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    concurrency: env.WORKER_CONCURRENCY,
    prefix: env.QUEUE_PREFIX
  }
);

datasetWorker.on("active", (job) => {
  logger.info(
    {
      queue: queueNames.datasetIngestion,
      jobId: job.id,
      jobName: job.name
    },
    "job started"
  );
});

datasetWorker.on("completed", (job) => {
  logger.info(
    {
      queue: queueNames.datasetIngestion,
      jobId: job.id,
      jobName: job.name
    },
    "job completed"
  );
});

datasetWorker.on("failed", (job, error) => {
  logger.error(
    {
      queue: queueNames.datasetIngestion,
      jobId: job?.id,
      jobName: job?.name,
      error: {
        name: error.name,
        message: error.message
      }
    },
    "job failed"
  );
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "worker shutdown requested");
  await datasetWorker.close();
  logger.info("worker shutdown complete");
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});

logger.info(
  {
    queue: queueNames.datasetIngestion,
    concurrency: env.WORKER_CONCURRENCY
  },
  "worker started"
);
