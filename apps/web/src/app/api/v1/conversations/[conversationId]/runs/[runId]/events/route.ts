import { z } from "zod";
import { runEventSchema } from "@agentic-csv/contracts";
import {
  acquireConversationStreamLease,
  authenticateBrowserRequest,
  errorResponse,
  HttpError,
  protectConversationStream
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const streamLifetimeMs = 25_000;
const pollIntervalMs = 300;
const eventPageSize = 100;

export async function GET(
  request: Request,
  {
    params
  }: {
    readonly params: Promise<{
      readonly conversationId: string;
      readonly runId: string;
    }>;
  }
) {
  let correlationId = crypto.randomUUID();
  let lease: Awaited<ReturnType<typeof acquireConversationStreamLease>> | undefined;
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const rateHeaders = await protectConversationStream(context.session.userId);
    lease = await acquireConversationStreamLease(context.session.userId);
    const values = await params;
    const conversationId = idSchema.parse(values.conversationId);
    const runId = idSchema.parse(values.runId);
    const afterSequence = readLastEventSequence(request);
    const initial = await getRuntime().conversationService.listRunEvents({
      userId: context.session.userId,
      conversationId,
      runId,
      afterSequence
    });
    const encoder = new TextEncoder();
    let released = false;
    const release = async () => {
      if (released || !lease) return;
      released = true;
      try {
        await lease.release();
      } catch (error) {
        getRuntime().logger.warn(
          {
            correlationId: context.correlationId,
            code: "SSE_LEASE_RELEASE_FAILED",
            error: { name: error instanceof Error ? error.name : "UnknownError" }
          },
          "conversation stream lease release failed"
        );
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor = afterSequence;
        let page = initial;
        let lastHeartbeat = Date.now();
        const deadline = Date.now() + streamLifetimeMs;
        controller.enqueue(encoder.encode("retry: 1000\n\n"));
        try {
          while (!request.signal.aborted && Date.now() < deadline) {
            for (const event of page.events) {
              if (event.sequence <= cursor) continue;
              const safeEvent = runEventSchema.parse({
                ...event,
                occurredAt: event.occurredAt.toISOString()
              });
              controller.enqueue(encoder.encode(formatEvent(safeEvent)));
              cursor = event.sequence;
            }
            if (page.events.length === eventPageSize) {
              page = await getRuntime().conversationService.listRunEvents({
                userId: context.session.userId,
                conversationId,
                runId,
                afterSequence: cursor,
                limit: eventPageSize
              });
              continue;
            }
            if (terminalStatuses.has(page.status)) break;
            if (Date.now() - lastHeartbeat >= 10_000) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              lastHeartbeat = Date.now();
            }
            await delay(pollIntervalMs);
            page = await getRuntime().conversationService.listRunEvents({
              userId: context.session.userId,
              conversationId,
              runId,
              afterSequence: cursor,
              limit: eventPageSize
            });
          }
          controller.close();
        } catch (error) {
          getRuntime().logger.error(
            {
              correlationId: context.correlationId,
              code: "SSE_STREAM_FAILED",
              error: { name: error instanceof Error ? error.name : "UnknownError" }
            },
            "conversation stream failed"
          );
          controller.error(new Error("Conversation stream ended unexpectedly."));
        } finally {
          await release();
        }
      },
      async cancel() {
        await release();
      }
    });
    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
        "x-correlation-id": context.correlationId,
        ...rateHeaders
      }
    });
  } catch (error) {
    if (lease) await lease.release().catch(() => undefined);
    return errorResponse(error, correlationId);
  }
}

function readLastEventSequence(request: Request): number {
  const url = new URL(request.url);
  const value =
    request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0";
  if (!/^\d{1,10}$/.test(value)) {
    throw new HttpError(400, "LAST_EVENT_ID_INVALID", "Last-Event-ID is invalid.");
  }
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new HttpError(400, "LAST_EVENT_ID_INVALID", "Last-Event-ID is invalid.");
  }
  return sequence;
}

function formatEvent(event: z.infer<typeof runEventSchema>): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
