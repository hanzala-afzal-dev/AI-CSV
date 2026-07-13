import { describe, expect, it } from "vitest";
import {
  Conversation,
  createUuidV7,
  isActiveAgentRunStatus,
  titleFromFirstMessage
} from "../src";

describe("Conversation", () => {
  it("normalizes titles and records archive lifecycle transitions", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    const conversation = Conversation.create({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      title: "  Quarterly   review  ",
      now
    });

    expect(conversation.title).toBe("Quarterly review");
    conversation.setArchived(true, new Date(now.getTime() + 1000));
    conversation.setArchived(false, new Date(now.getTime() + 2000));

    expect(conversation.status).toBe("active");
    expect(conversation.toPrimitives().version).toBe(3);
    expect(conversation.pullDomainEvents().map((event) => event.name)).toEqual([
      "conversation.created",
      "conversation.archived",
      "conversation.unarchived"
    ]);
  });

  it("rejects empty and oversized titles", () => {
    expect(() => Conversation.create({ userId: "user-1", title: "   " })).toThrow(
      "between 1 and 120"
    );
    expect(() =>
      Conversation.create({ userId: "user-1", title: "x".repeat(121) })
    ).toThrow("between 1 and 120");
  });

  it("generates a stable bounded title from the first message", () => {
    expect(
      titleFromFirstMessage(
        "Compare net revenue by country for the last four completed quarters and flag anomalies"
      )
    ).toBe("Compare net revenue by country for the last four...");
  });

  it("distinguishes active and terminal run states", () => {
    expect(isActiveAgentRunStatus("queued")).toBe(true);
    expect(isActiveAgentRunStatus("waiting_for_user")).toBe(true);
    expect(isActiveAgentRunStatus("completed")).toBe(false);
    expect(isActiveAgentRunStatus("cancelled")).toBe(false);
  });

  it("generates time-ordered UUIDv7 identifiers for conversation entities", () => {
    const timestamp = Date.parse("2026-07-13T12:00:00.000Z");
    const id = createUuidV7(timestamp);

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(timestamp);
  });
});
