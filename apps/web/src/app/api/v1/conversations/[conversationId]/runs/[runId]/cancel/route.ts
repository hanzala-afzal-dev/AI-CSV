import { z } from "zod";
import { emptyJsonRequestSchema } from "@agentic-csv/contracts";
import { conversationResponse, safeRun } from "@/server/conversation-http";
import { authorizeBrowserMutation, errorResponse, readJson } from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();

export async function POST(
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
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const values = await params;
    const conversationId = idSchema.parse(values.conversationId);
    const runId = idSchema.parse(values.runId);
    emptyJsonRequestSchema.parse(await readJson(request));
    const run = await getRuntime().conversationService.cancelRun({
      userId: context.session.userId,
      conversationId,
      runId
    });
    return conversationResponse(
      { run: safeRun(run) },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
