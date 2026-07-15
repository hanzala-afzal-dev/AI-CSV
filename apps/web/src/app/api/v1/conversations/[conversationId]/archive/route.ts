import { z } from "zod";
import { archiveConversationRequestSchema } from "@agentic-csv/contracts";
import { conversationResponse, safeConversation } from "@/server/conversation-http";
import { authorizeBrowserMutation, errorResponse, readJson } from "@/server/http";
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
    const conversationId = idSchema.parse((await params).conversationId);
    const body = archiveConversationRequestSchema.parse(await readJson(request));
    const conversation = await getRuntime().conversationService.setArchived({
      userId: context.session.userId,
      conversationId,
      archived: body.archived
    });
    return conversationResponse(
      { conversation: safeConversation(conversation) },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
