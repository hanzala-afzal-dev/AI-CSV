import { Worker } from "bullmq";
import {
  createBullMqConnectionOptions,
  createDatabaseClient,
  createLogger,
  createPgPool,
  loadEnv,
  OutboxDispatcher,
  queueNames
} from "@agentic-csv/infrastructure";
import { processDatasetIngestionJob } from "./processors/dataset-ingestion.processor";

const env = loadEnv();
const logger = createLogger(env).child({ serviceProcess: "worker" });
const pool = createPgPool(env);
const database = createDatabaseClient(pool);
const outboxDispatcher = new OutboxDispatcher(database, env, logger);
let dispatchRunning = false;

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
  const correlationId = readCorrelationId(job?.data);
  const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
  const willRetry = Boolean(job && job.attemptsMade < attempts);
  const log = willRetry ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(
    {
      queue: queueNames.datasetIngestion,
      jobId: job?.id,
      jobName: job?.name,
      correlationId,
      attempt: job?.attemptsMade,
      willRetry,
      error: {
        name: error.name,
        message: error.message
      }
    },
    "job failed"
  );
});

datasetWorker.on("error", (error) => {
  logger.error({ error: { name: error.name, message: error.message } }, "worker error");
});

async function dispatchOutbox(): Promise<void> {
  if (dispatchRunning) {
    return;
  }
  dispatchRunning = true;
  try {
    const published = await outboxDispatcher.dispatchBatch();
    if (published > 0) {
      logger.info({ published }, "outbox batch dispatched");
    }
  } finally {
    dispatchRunning = false;
  }
}

const outboxTimer = setInterval(() => void dispatchOutbox(), 5000);
outboxTimer.unref();
void dispatchOutbox();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "worker shutdown requested");
  clearInterval(outboxTimer);
  await datasetWorker.close();
  await outboxDispatcher.close();
  await pool.end();
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

function readCorrelationId(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "correlationId" in value &&
    typeof value.correlationId === "string"
  ) {
    return value.correlationId;
  }
  return undefined;
}
