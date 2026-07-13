import type { Job } from "bullmq";
import type { ConversationRunService } from "@agentic-csv/application";
import { agentRunJobPayloadSchema } from "@agentic-csv/contracts";
import type { AppLogger } from "@agentic-csv/infrastructure";

export async function processAgentRunJob(
  job: Job<unknown>,
  service: ConversationRunService,
  logger: AppLogger
): Promise<void> {
  const payload = agentRunJobPayloadSchema.parse(job.data);
  const childLogger = logger.child({
    queue: "agent-run",
    jobId: job.id,
    correlationId: payload.correlationId,
    conversationId: payload.conversationId,
    runId: payload.runId
  });
  childLogger.info("conversation run started");
  await service.process(payload);
  childLogger.info("conversation run persisted");
}
