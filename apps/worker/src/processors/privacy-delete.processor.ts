import type { Job } from "bullmq";
import type { PrivacyDeletionProcessor } from "@agentic-csv/application";
import { privacyDeleteJobPayloadSchema } from "@agentic-csv/contracts";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processPrivacyDeleteJob(
  job: Job<unknown>,
  service: PrivacyDeletionProcessor,
  logger: AppLogger
): Promise<void> {
  const payload = privacyDeleteJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "privacy-deletion",
    jobId: job.id,
    correlationId: payload.correlationId,
    deletionId: payload.deletionId,
    userId: payload.userId
  });
  await service.process(payload);
  childLogger.info("privacy deletion completed");
}
