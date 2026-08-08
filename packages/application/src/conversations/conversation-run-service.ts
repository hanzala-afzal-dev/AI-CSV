import { createUuidV7, titleFromFirstMessage } from "@agentic-csv/domain";
import type { ConversationRepository, ConversationResponder } from "./ports";

export interface ConversationRunFailureDiagnostic {
  readonly correlationId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly errorName: string;
}

export class ConversationRunService {
  public constructor(
    private readonly repository: ConversationRepository,
    private readonly responder: ConversationResponder,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = createUuidV7,
    private readonly onUnexpectedFailure?: (
      diagnostic: ConversationRunFailureDiagnostic
    ) => void
  ) {}

  public async process(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly correlationId: string;
  }): Promise<void> {
    const work = await this.repository.claimRun({ ...input, occurredAt: this.now() });
    if (!work) return;
    try {
      const response = await this.responder.respond({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        userMessageId: work.userMessageId,
        correlationId: input.correlationId,
        selectedModel: work.selectedModel,
        selectedReasoningEffort: work.selectedReasoningEffort,
        content: work.content
      });
      if (response.state === "waiting_for_user") {
        await this.repository.pauseRun({
          userId: work.userId,
          conversationId: work.conversationId,
          runId: work.runId,
          clarification: response.clarification,
          metrics: response.metrics,
          occurredAt: this.now()
        });
        return;
      }
      await this.repository.completeRun({
        userId: work.userId,
        conversationId: work.conversationId,
        runId: work.runId,
        assistantMessageId: this.createId(),
        assistantText: response.text,
        ...(response.analysis ? { analysis: response.analysis } : {}),
        generatedTitle: titleFromFirstMessage(work.content),
        ...(response.metrics ? { metrics: response.metrics } : {}),
        occurredAt: this.now()
      });
    } catch (error) {
      const failure = analysisFailure(error);
      if (failure.code === "ASSISTANT_RESPONSE_FAILED") {
        this.reportUnexpectedFailure({
          correlationId: input.correlationId,
          conversationId: work.conversationId,
          runId: work.runId,
          errorName: error instanceof Error ? error.name : "UnknownError"
        });
      }
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

  private reportUnexpectedFailure(diagnostic: ConversationRunFailureDiagnostic): void {
    try {
      this.onUnexpectedFailure?.(diagnostic);
    } catch {
      // Diagnostics must never replace the persisted safe failure.
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
    (error.name === "AnalysisError" || error.name === "AgentError") &&
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
