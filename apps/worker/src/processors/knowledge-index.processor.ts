import type { Job } from "bullmq";
import type { MemoryIndexingService } from "@agentic-csv/application";
import { knowledgeIndexJobPayloadSchema } from "@agentic-csv/contracts";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processKnowledgeIndexJob(
  job: Job<unknown>,
  service: MemoryIndexingService,
  logger: AppLogger
): Promise<void> {
  const payload = knowledgeIndexJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "knowledge-indexing",
    jobId: job.id,
    correlationId: payload.correlationId,
    datasetId: payload.datasetId,
    datasetVersionId: payload.datasetVersionId,
    source: payload.source,
    userId: payload.userId
  });
  const indexedDocuments = await service.process(payload);
  childLogger.info({ indexedDocuments }, "semantic memory indexing completed");
}
