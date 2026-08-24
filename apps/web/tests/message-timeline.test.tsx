import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConversationDetailContract } from "@agentic-csv/contracts";
import { MessageTimeline } from "../src/components/conversations/message-timeline";

const now = "2026-08-23T16:00:00.000Z";
const detail: ConversationDetailContract = {
  conversation: {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Chart questions",
    status: "active",
    activeDataset: null,
    lastMessageSequence: 1,
    lastActivityAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now
  },
  messages: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      conversationId: "11111111-1111-4111-8111-111111111111",
      sequence: 1,
      role: "user",
      status: "final",
      content: {
        version: 1,
        parts: [{ type: "text", text: "Line chart over Date of birth" }]
      },
      createdAt: now,
      finalizedAt: now
    }
  ],
  activeRun: null
};

describe("MessageTimeline", () => {
  it("keeps populated messages visible during a background refresh", () => {
    const html = renderToStaticMarkup(
      <MessageTimeline
        detail={detail}
        loading
        streamedText=""
        run={null}
        datasetPanel={<div>Dataset</div>}
        progressText="Preparing analysis"
        clarificationBusy={false}
        onClarification={vi.fn()}
      />
    );

    expect(html).toContain("Line chart over Date of birth");
    expect(html).not.toContain("Loading conversation");
  });

  it("shows the skeleton only before the first detail payload", () => {
    const html = renderToStaticMarkup(
      <MessageTimeline
        detail={null}
        loading
        streamedText=""
        run={null}
        datasetPanel={<div>Dataset</div>}
        progressText="Preparing analysis"
        clarificationBusy={false}
        onClarification={vi.fn()}
      />
    );

    expect(html).toContain("Loading conversation");
  });
});
