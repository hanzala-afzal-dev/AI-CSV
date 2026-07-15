import type {
  ConversationResponder,
  DatasetReadRepository
} from "@agentic-csv/application";

export class DeterministicConversationResponder implements ConversationResponder {
  public constructor(private readonly datasets?: DatasetReadRepository) {}

  public async respond(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly content: string;
  }): Promise<{ readonly text: string }> {
    const dataset = await this.datasets?.getConversationContext(
      input.userId,
      input.conversationId
    );
    if (dataset) {
      if (dataset.status === "failed") {
        return {
          text: `${dataset.originalFilename} could not be profiled safely. Remove it or upload a corrected CSV before continuing.`
        };
      }
      if (dataset.status !== "ready") {
        return {
          text: `${dataset.originalFilename} is still ${humanizeStatus(dataset.status)}. I will use its persisted profile once processing finishes.`
        };
      }
      const columns = dataset.columnNames.slice(0, 8).join(", ");
      const remaining = Math.max(0, dataset.columnNames.length - 8);
      return {
        text: `${dataset.name} is ready with ${dataset.rowCount ?? 0} rows and ${dataset.columnCount ?? 0} columns. Columns include ${columns || "no named columns"}${remaining > 0 ? `, and ${remaining} more` : ""}. The dataset profile is available for the next analytical step.`
      };
    }

    const question = input.content.toLocaleLowerCase("en-US");
    if (/\b(hello|hi|hey)\b/.test(question)) {
      return {
        text: "Hello. I am ready to help organize your analysis. Connect a CSV to ask data-backed questions."
      };
    }
    if (question.includes("what can") || question.includes("help")) {
      return {
        text: "I can keep analysis conversations organized and, with a connected CSV, help inspect its structure, calculate answers, and explain the result."
      };
    }
    return {
      text: "I saved your question in this conversation. Connect a CSV to continue with a data-backed analysis."
    };
  }
}

function humanizeStatus(status: string): string {
  return status.replaceAll("_", " ");
}
