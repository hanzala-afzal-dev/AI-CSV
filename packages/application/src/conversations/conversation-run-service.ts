import { createUuidV7, titleFromFirstMessage } from "@agentic-csv/domain";
import type { ConversationRepository, ConversationResponder } from "./ports";

export class ConversationRunService {
  public constructor(
    private readonly repository: ConversationRepository,
    private readonly responder: ConversationResponder,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = createUuidV7
  ) {}

  public async process(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<void> {
    const work = await this.repository.claimRun({ ...input, occurredAt: this.now() });
    if (!work) return;
    try {
      const response = await this.responder.respond({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        content: work.content
      });
      await this.repository.completeRun({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        assistantMessageId: this.createId(),
        assistantText: response.text,
        ...(response.analysis ? { analysis: response.analysis } : {}),
        generatedTitle: titleFromFirstMessage(work.content),
        occurredAt: this.now()
      });
    } catch (error) {
      const failure = analysisFailure(error);
      await this.repository.failRun({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        code: failure.code,
        message: failure.message,
        occurredAt: this.now()
      });
    }
  }
}

function analysisFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AnalysisError" &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "ASSISTANT_RESPONSE_FAILED",
    message: "The assistant could not complete this response."
  };
}
