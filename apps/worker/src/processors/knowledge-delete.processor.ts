import type { Job } from "bullmq";
import type { MemoryDeletionService } from "@agentic-csv/application";
import { knowledgeDeleteJobPayloadSchema } from "@agentic-csv/contracts";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processKnowledgeDeleteJob(
  job: Job<unknown>,
  service: MemoryDeletionService,
  logger: AppLogger
): Promise<void> {
  const payload = knowledgeDeleteJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "knowledge-deletion",
    jobId: job.id,
    correlationId: payload.correlationId,
    scope: payload.scope,
    userId: payload.userId
  });
  await service.process(payload);
  childLogger.info("semantic memory deletion completed");
}
