import { Worker } from "bullmq";
import { ConversationRunService } from "@agentic-csv/application";
import { DatasetIngestionService } from "@agentic-csv/application";
import {
  createBullMqConnectionOptions,
  createDatabaseClient,
  createS3Client,
  createLogger,
  createPgPool,
  DeterministicConversationResponder,
  loadEnv,
  OutboxDispatcher,
  PostgresDatasetRepository,
  PostgresConversationRepository,
  S3ObjectStorage,
  queueNames
} from "@agentic-csv/infrastructure";
import { DuckDbCsvProfiler } from "@agentic-csv/infrastructure/analytics";
import { processAgentRunJob } from "./processors/agent-run.processor";
import { processDatasetIngestionJob } from "./processors/dataset-ingestion.processor";

const env = loadEnv();
const logger = createLogger(env).child({ serviceProcess: "worker" });
const pool = createPgPool(env);
const database = createDatabaseClient(pool);
const outboxDispatcher = new OutboxDispatcher(database, env, logger);
const datasetRepository = new PostgresDatasetRepository(database);
const objectStorage = new S3ObjectStorage(createS3Client(env), env.S3_BUCKET);
const datasetIngestionService = new DatasetIngestionService(
  datasetRepository,
  objectStorage,
  new DuckDbCsvProfiler({
    maxBytes: env.UPLOAD_MAX_BYTES,
    maxRows: env.CSV_MAX_ROWS,
    maxColumns: env.CSV_MAX_COLUMNS,
    maxFieldCharacters: env.CSV_MAX_FIELD_CHARACTERS,
    maxMalformedRowRatio: env.CSV_MAX_MALFORMED_ROW_RATIO,
    timeoutMs: env.CSV_PROFILE_TIMEOUT_MS,
    memoryLimitMb: env.DUCKDB_MEMORY_LIMIT_MB
  }),
  env.INGESTION_CLAIM_TTL_SECONDS
);
const conversationRunService = new ConversationRunService(
  new PostgresConversationRepository(database),
  new DeterministicConversationResponder(datasetRepository)
);
let dispatchRunning = false;

const datasetWorker = new Worker(
  queueNames.datasetIngestion,
  async (job) => processDatasetIngestionJob(job, datasetIngestionService, logger),
  {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    concurrency: env.WORKER_CONCURRENCY,
    prefix: env.QUEUE_PREFIX
  }
);

const agentRunWorker = new Worker(
  queueNames.agentRun,
  async (job) => processAgentRunJob(job, conversationRunService, logger),
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

agentRunWorker.on("active", (job) => {
  logger.info(
    { queue: queueNames.agentRun, jobId: job.id, jobName: job.name },
    "job started"
  );
});

agentRunWorker.on("completed", (job) => {
  logger.info(
    { queue: queueNames.agentRun, jobId: job.id, jobName: job.name },
    "job completed"
  );
});

agentRunWorker.on("failed", (job, error) => {
  const correlationId = readCorrelationId(job?.data);
  const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
  const willRetry = Boolean(job && job.attemptsMade < attempts);
  const log = willRetry ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(
    {
      queue: queueNames.agentRun,
      jobId: job?.id,
      jobName: job?.name,
      correlationId,
      attempt: job?.attemptsMade,
      willRetry,
      error: { name: error.name, message: error.message }
    },
    "job failed"
  );
});

agentRunWorker.on("error", (error) => {
  logger.error(
    {
      queue: queueNames.agentRun,
      error: { name: error.name, message: error.message }
    },
    "worker error"
  );
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
  await Promise.all([datasetWorker.close(), agentRunWorker.close()]);
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
    queues: [queueNames.datasetIngestion, queueNames.agentRun],
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
