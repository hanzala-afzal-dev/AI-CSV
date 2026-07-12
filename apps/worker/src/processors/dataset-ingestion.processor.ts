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
    userId: payload.userId
  });

  childLogger.info("dataset ingestion job validated");
  childLogger.info(
    "CSV profiling is deferred to Phase 5 in docs/specs/019-implementation-plan.md"
  );
}
