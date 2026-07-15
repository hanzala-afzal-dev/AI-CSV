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
        generatedTitle: titleFromFirstMessage(work.content),
        occurredAt: this.now()
      });
    } catch {
      await this.repository.failRun({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        code: "ASSISTANT_RESPONSE_FAILED",
        message: "The assistant could not complete this response.",
        occurredAt: this.now()
      });
    }
  }
}
