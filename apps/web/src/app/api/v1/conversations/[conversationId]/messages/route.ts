import { z } from "zod";
import { submitConversationMessageRequestSchema } from "@agentic-csv/contracts";
import { conversationResponse, runEventsUrl } from "@/server/conversation-http";
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
  { params }: { readonly params: Promise<{ readonly conversationId: string }> }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const submissionHeaders = await protectConversationSubmission(context.session.userId);
    const conversationId = idSchema.parse((await params).conversationId);
    const body = submitConversationMessageRequestSchema.parse(await readJson(request));
    const submission = await getRuntime().conversationService.submitMessage({
      userId: context.session.userId,
      conversationId,
      clientRequestId: body.clientRequestId,
      content: body.content,
      correlationId: context.correlationId
    });
    return conversationResponse(
      {
        messageId: submission.messageId,
        runId: submission.runId,
        status: "queued",
        eventsUrl: runEventsUrl(conversationId, submission.runId)
      },
      context.correlationId,
      submission.replayed ? 200 : 202,
      { ...context.responseHeaders, ...submissionHeaders }
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
