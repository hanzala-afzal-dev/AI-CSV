import type { Job } from "bullmq";
import { datasetIngestionJobPayloadSchema } from "@agentic-csv/contracts";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processDatasetIngestionJob(
  job: Job<unknown>,
  logger: AppLogger
): Promise<void> {
  const payload = datasetIngestionJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "dataset-ingestion",
    jobId: job.id,
    correlationId: payload.correlationId,
    datasetId: payload.datasetId,
    ownerId: payload.ownerId
  });

  childLogger.info("dataset ingestion job validated");
  childLogger.info(
    "CSV profiling is deferred to specs/001-csv-upload and the later profiling specification"
  );
}
