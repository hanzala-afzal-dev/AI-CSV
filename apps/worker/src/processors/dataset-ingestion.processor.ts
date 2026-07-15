import type { Job } from "bullmq";
import { datasetIngestionJobPayloadSchema } from "@agentic-csv/contracts";
import type { DatasetIngestionService } from "@agentic-csv/application";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processDatasetIngestionJob(
  job: Job<unknown>,
  service: DatasetIngestionService,
  logger: AppLogger
): Promise<void> {
  const payload = datasetIngestionJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "dataset-ingestion",
    jobId: job.id,
    correlationId: payload.correlationId,
    datasetId: payload.datasetId,
    userId: payload.userId
  });

  const claimId = String(job.id ?? payload.idempotencyKey).slice(0, 128);
  try {
    const result = await service.process(payload, claimId);
    childLogger.info({ result }, "dataset ingestion job processed");
  } catch (error) {
    const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    if (job.attemptsMade + 1 >= attempts) {
      try {
        await service.failAfterRetries(payload, claimId);
      } catch (persistenceError) {
        childLogger.error(
          {
            error: {
              name:
                persistenceError instanceof Error ? persistenceError.name : "UnknownError"
            }
          },
          "dataset retry exhaustion could not be persisted"
        );
      }
    }
    throw error;
  }
}
