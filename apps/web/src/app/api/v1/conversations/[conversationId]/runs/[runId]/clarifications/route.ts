import { z } from "zod";
import { submitClarificationRequestSchema } from "@agentic-csv/contracts";
import { conversationResponse, safeRun } from "@/server/conversation-http";
import {
  authorizeBrowserMutation,
  errorResponse,
  protectConversationSubmission,
  readJson
} from "@/server/http";
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
    const rateHeaders = await protectConversationSubmission(context.session.userId);
    const values = await params;
    const conversationId = idSchema.parse(values.conversationId);
    const runId = idSchema.parse(values.runId);
    const body = submitClarificationRequestSchema.parse(await readJson(request));
    const run = await getRuntime().conversationService.resumeRun({
      userId: context.session.userId,
      conversationId,
      runId,
      answer: body.answer,
      saveAsDatasetDefinition: body.saveAsDatasetDefinition,
      correlationId: context.correlationId
    });
    return conversationResponse({ run: safeRun(run) }, context.correlationId, 202, {
      ...context.responseHeaders,
      ...rateHeaders
    });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
