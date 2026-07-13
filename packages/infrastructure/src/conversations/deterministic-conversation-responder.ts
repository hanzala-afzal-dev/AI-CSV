import type { ConversationResponder } from "@agentic-csv/application";

export class DeterministicConversationResponder implements ConversationResponder {
  public async respond(input: {
    readonly content: string;
  }): Promise<{ readonly text: string }> {
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
