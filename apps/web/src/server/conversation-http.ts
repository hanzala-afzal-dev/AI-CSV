import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  AgentRunView,
  ConversationDetailView,
  ConversationPage
} from "@agentic-csv/application";
import type { ConversationProps } from "@agentic-csv/domain";
import { HttpError } from "./http";

const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    lastActivityAt: z.string().datetime(),
    id: z.string().uuid()
  })
  .strict();

export function conversationResponse(
  data: unknown,
  correlationId: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): NextResponse {
  return NextResponse.json({ ok: true, data, correlationId }, { status, headers });
}

export function safeConversation(conversation: ConversationProps) {
  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status,
    lastMessageSequence: conversation.lastMessageSequence,
    lastActivityAt: conversation.lastActivityAt.toISOString(),
    version: conversation.version,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}

export function safeConversationPage(page: ConversationPage) {
  return {
    conversations: page.conversations.map(safeConversation),
    nextCursor: page.nextCursor ? encodeConversationCursor(page.nextCursor) : null
  };
}

export function safeConversationDetail(detail: ConversationDetailView) {
  return {
    conversation: safeConversation(detail.conversation),
    messages: detail.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      sequence: message.sequence,
      role: message.role,
      status: message.status,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      finalizedAt: message.finalizedAt?.toISOString() ?? null
    })),
    activeRun: detail.activeRun ? safeRun(detail.activeRun) : null
  };
}

export function safeRun(run: AgentRunView) {
  return {
    id: run.id,
    conversationId: run.conversationId,
    userMessageId: run.userMessageId,
    status: run.status,
    eventsUrl: runEventsUrl(run.conversationId, run.id),
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}

export function runEventsUrl(conversationId: string, runId: string): string {
  return `/api/v1/conversations/${conversationId}/runs/${runId}/events`;
}

export function decodeConversationCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
    return { lastActivityAt: new Date(parsed.lastActivityAt), id: parsed.id };
  } catch {
    throw new HttpError(400, "CURSOR_INVALID", "Conversation cursor is invalid.");
  }
}

function encodeConversationCursor(cursor: {
  readonly lastActivityAt: Date;
  readonly id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      lastActivityAt: cursor.lastActivityAt.toISOString(),
      id: cursor.id
    })
  ).toString("base64url");
}
