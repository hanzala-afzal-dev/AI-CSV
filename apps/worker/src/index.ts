import { Worker } from "bullmq";
import { resolve } from "node:path";
import {
  AgentProviderService,
  AnalysisService,
  ConversationRunService,
  DatasetIngestionService,
  DeterministicAnalysisPlanner,
  MemoryDeletionService,
  MemoryIndexingService,
  MemoryRetrievalService,
  PrivacyDeletionProcessor
} from "@agentic-csv/application";
import {
  LangChainOpenAiAgentGateway,
  LangGraphConversationResponder,
  loadTrustedAgentPolicies
} from "@agentic-csv/agent";
import {
  AesGcmCredentialCipher,
  createBullMqConnectionOptions,
  createDatabaseClient,
  createLogger,
  createPgPool,
  createQdrantClient,
  createRedisClient,
  createS3Client,
  loadEnv,
  OpenAiEmbeddingProvider,
  OutboxDispatcher,
  PostgresAnalysisRepository,
  PostgresAgentCheckpointRepository,
  PostgresConversationRepository,
  PostgresDatasetRepository,
  PostgresMemoryRepository,
  PostgresPrivacyDeletionRepository,
  PostgresProviderSettingsRepository,
  QdrantSemanticVectorStore,
  RedisMemoryRetrievalCache,
  RedisPrivacyEphemeralPurger,
  S3ObjectStorage,
  queueNames
} from "@agentic-csv/infrastructure";
import {
  DuckDbAnalysisEngine,
  DuckDbCsvProfiler
} from "@agentic-csv/infrastructure/analytics";
import { processAgentRunJob } from "./processors/agent-run.processor";
import { processDatasetIngestionJob } from "./processors/dataset-ingestion.processor";
import { processKnowledgeDeleteJob } from "./processors/knowledge-delete.processor";
import { processKnowledgeIndexJob } from "./processors/knowledge-index.processor";
import { processPrivacyDeleteJob } from "./processors/privacy-delete.processor";

const env = loadEnv();
const logger = createLogger(env).child({ serviceProcess: "worker" });
const trustedAgentPolicy = await loadTrustedAgentPolicies(
  resolve(import.meta.dirname, "../../../knowledge-base")
);
const pool = createPgPool(env);
const database = createDatabaseClient(pool);
const outboxDispatcher = new OutboxDispatcher(database, env, logger);
const datasetRepository = new PostgresDatasetRepository(database);
const objectStorage = new S3ObjectStorage(createS3Client(env), env.S3_BUCKET);
const analysisRepository = new PostgresAnalysisRepository(database);
const conversationRepository = new PostgresConversationRepository(database);
const credentialCipher = new AesGcmCredentialCipher({
  currentKey: env.APP_ENCRYPTION_KEY,
  currentKeyVersion: env.APP_ENCRYPTION_KEY_VERSION,
  ...(env.APP_ENCRYPTION_PREVIOUS_KEYS === undefined
    ? {}
    : { previousKeys: env.APP_ENCRYPTION_PREVIOUS_KEYS })
});
const providerSettingsRepository = new PostgresProviderSettingsRepository(database);
const memoryRepository = new PostgresMemoryRepository(database);
const memoryRedis = createRedisClient(env);
const embeddingProvider = new OpenAiEmbeddingProvider(
  providerSettingsRepository,
  credentialCipher,
  {
    baseUrl: env.OPENAI_API_BASE_URL,
    modelId: env.OPENAI_EMBEDDING_MODEL,
    vectorSize: env.QDRANT_VECTOR_SIZE,
    timeoutMs: env.MEMORY_EMBEDDING_TIMEOUT_MS,
    maxInputCharacters: env.MEMORY_EMBEDDING_MAX_CHARACTERS
  }
);
const semanticVectors = new QdrantSemanticVectorStore(
  createQdrantClient(env),
  env.QDRANT_COLLECTION,
  env.QDRANT_VECTOR_SIZE
);
const memoryRetrieval = new MemoryRetrievalService(
  memoryRepository,
  embeddingProvider,
  semanticVectors,
  new RedisMemoryRetrievalCache(
    memoryRedis,
    env.REDIS_KEY_PREFIX,
    env.AUTH_SECRET,
    env.MEMORY_CACHE_TTL_SECONDS
  ),
  {
    topK: env.MEMORY_RETRIEVAL_TOP_K,
    scoreThreshold: env.MEMORY_RETRIEVAL_SCORE_THRESHOLD,
    maxContextCharacters: env.MEMORY_MAX_CONTEXT_CHARACTERS
  },
  (error) => logger.warn({ error }, "semantic memory retrieval degraded")
);
const memoryIndexing = new MemoryIndexingService(
  memoryRepository,
  embeddingProvider,
  semanticVectors,
  { batchSize: env.MEMORY_EMBEDDING_BATCH_SIZE }
);
const memoryDeletion = new MemoryDeletionService(semanticVectors);
const privacyEphemeral = new RedisPrivacyEphemeralPurger(
  memoryRedis,
  env.REDIS_KEY_PREFIX,
  env
);
const privacyDeletion = new PrivacyDeletionProcessor(
  new PostgresPrivacyDeletionRepository(database),
  objectStorage,
  semanticVectors,
  privacyEphemeral
);
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
const analysisService = new AnalysisService(
  analysisRepository,
  objectStorage,
  new DeterministicAnalysisPlanner(),
  new DuckDbAnalysisEngine({
    maxScanBytes: env.ANALYSIS_MAX_SCAN_BYTES,
    maxResultRows: env.ANALYSIS_MAX_RESULT_ROWS,
    maxResultBytes: env.ANALYSIS_MAX_RESULT_BYTES,
    timeoutMs: env.ANALYSIS_QUERY_TIMEOUT_MS,
    memoryLimitMb: env.DUCKDB_MEMORY_LIMIT_MB,
    threads: env.ANALYSIS_DUCKDB_THREADS
  })
);
const conversationRunService = new ConversationRunService(
  conversationRepository,
  new LangGraphConversationResponder(
    analysisService,
    new AgentProviderService(
      providerSettingsRepository,
      credentialCipher,
      new LangChainOpenAiAgentGateway({
        baseUrl: env.OPENAI_API_BASE_URL,
        timeoutMs: env.AGENT_PROVIDER_TIMEOUT_MS,
        trustedPolicy: trustedAgentPolicy,
        onProviderError: (providerError) =>
          logger.warn({ providerError }, "OpenAI analytical request failed")
      })
    ),
    new PostgresAgentCheckpointRepository(database),
    conversationRepository,
    {
      maxSteps: env.AGENT_MAX_STEPS,
      maxRepairs: env.AGENT_MAX_REPAIRS,
      maxToolCalls: env.AGENT_MAX_TOOL_CALLS,
      maxResultRowsToModel: env.AGENT_MAX_RESULT_ROWS_TO_MODEL
    },
    undefined,
    undefined,
    memoryRetrieval
  ),
  undefined,
  undefined,
  (diagnostic) =>
    logger.error({ conversationRunFailure: diagnostic }, "conversation run failed")
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

const knowledgeIndexWorker = new Worker(
  queueNames.knowledgeIndexing,
  async (job) => processKnowledgeIndexJob(job, memoryIndexing, logger),
  {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    concurrency: env.WORKER_CONCURRENCY,
    prefix: env.QUEUE_PREFIX
  }
);

const knowledgeDeleteWorker = new Worker(
  queueNames.knowledgeDeletion,
  async (job) => processKnowledgeDeleteJob(job, memoryDeletion, logger),
  {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    concurrency: env.WORKER_CONCURRENCY,
    prefix: env.QUEUE_PREFIX
  }
);

const privacyDeleteWorker = new Worker(
  queueNames.privacyDeletion,
  async (job) => processPrivacyDeleteJob(job, privacyDeletion, logger),
  {
    connection: createBullMqConnectionOptions(env.REDIS_URL),
    concurrency: Math.max(1, Math.min(2, env.WORKER_CONCURRENCY)),
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

knowledgeIndexWorker.on("active", (job) => {
  logger.info(
    { queue: queueNames.knowledgeIndexing, jobId: job.id, jobName: job.name },
    "job started"
  );
});

knowledgeIndexWorker.on("completed", (job) => {
  logger.info(
    { queue: queueNames.knowledgeIndexing, jobId: job.id, jobName: job.name },
    "job completed"
  );
});

knowledgeIndexWorker.on("failed", (job, error) => {
  const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
  const willRetry = Boolean(job && job.attemptsMade < attempts);
  const log = willRetry ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(
    {
      queue: queueNames.knowledgeIndexing,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: readCorrelationId(job?.data),
      attempt: job?.attemptsMade,
      willRetry,
      error: { name: error.name, message: error.message }
    },
    "job failed"
  );
});

knowledgeIndexWorker.on("error", (error) => {
  logger.error(
    {
      queue: queueNames.knowledgeIndexing,
      error: { name: error.name, message: error.message }
    },
    "worker error"
  );
});

knowledgeDeleteWorker.on("active", (job) => {
  logger.info(
    { queue: queueNames.knowledgeDeletion, jobId: job.id, jobName: job.name },
    "job started"
  );
});

knowledgeDeleteWorker.on("completed", (job) => {
  logger.info(
    { queue: queueNames.knowledgeDeletion, jobId: job.id, jobName: job.name },
    "job completed"
  );
});

knowledgeDeleteWorker.on("failed", (job, error) => {
  const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
  const willRetry = Boolean(job && job.attemptsMade < attempts);
  const log = willRetry ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(
    {
      queue: queueNames.knowledgeDeletion,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: readCorrelationId(job?.data),
      attempt: job?.attemptsMade,
      willRetry,
      error: { name: error.name, message: error.message }
    },
    "job failed"
  );
});

knowledgeDeleteWorker.on("error", (error) => {
  logger.error(
    {
      queue: queueNames.knowledgeDeletion,
      error: { name: error.name, message: error.message }
    },
    "worker error"
  );
});

privacyDeleteWorker.on("active", (job) => {
  logger.info(
    { queue: queueNames.privacyDeletion, jobId: job.id, jobName: job.name },
    "job started"
  );
});

privacyDeleteWorker.on("completed", (job) => {
  logger.info(
    { queue: queueNames.privacyDeletion, jobId: job.id, jobName: job.name },
    "job completed"
  );
});

privacyDeleteWorker.on("failed", (job, error) => {
  const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
  const willRetry = Boolean(job && job.attemptsMade < attempts);
  const log = willRetry ? logger.warn.bind(logger) : logger.error.bind(logger);
  log(
    {
      queue: queueNames.privacyDeletion,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: readCorrelationId(job?.data),
      attempt: job?.attemptsMade,
      willRetry,
      error: { name: error.name, message: error.message }
    },
    "job failed"
  );
});

privacyDeleteWorker.on("error", (error) => {
  logger.error(
    {
      queue: queueNames.privacyDeletion,
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
  await Promise.all([
    datasetWorker.close(),
    agentRunWorker.close(),
    knowledgeIndexWorker.close(),
    knowledgeDeleteWorker.close(),
    privacyDeleteWorker.close()
  ]);
  await outboxDispatcher.close();
  await privacyEphemeral.close();
  if (memoryRedis.isOpen) await memoryRedis.quit();
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
    queues: [
      queueNames.datasetIngestion,
      queueNames.agentRun,
      queueNames.knowledgeIndexing,
      queueNames.knowledgeDeletion,
      queueNames.privacyDeletion
    ],
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
