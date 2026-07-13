import { describe, expect, it } from "vitest";
import {
  runEventSchema,
  submitConversationMessageRequestSchema,
  updateConversationRequestSchema
} from "../src";

describe("conversation contracts", () => {
  it("normalizes a valid message request and rejects mass assignment", () => {
    expect(
      submitConversationMessageRequestSchema.parse({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        content: "  Compare revenue  "
      })
    ).toEqual({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      content: "Compare revenue"
    });
    expect(() =>
      submitConversationMessageRequestSchema.parse({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        content: "Hello",
        userId: "bob"
      })
    ).toThrow();
  });

  it("rejects unsupported control characters and unsafe title input", () => {
    expect(() =>
      submitConversationMessageRequestSchema.parse({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        content: "hello\u0000world"
      })
    ).toThrow();
    expect(() => updateConversationRequestSchema.parse({ title: "" })).toThrow();
  });

  it("validates known versioned run events", () => {
    expect(
      runEventSchema.parse({
        id: "4",
        runId: "11111111-1111-4111-8111-111111111111",
        sequence: 4,
        type: "run.completed",
        occurredAt: "2026-07-13T12:00:00.000Z",
        payload: {
          version: 1,
          messageId: "22222222-2222-4222-8222-222222222222"
        }
      }).type
    ).toBe("run.completed");
  });
});
