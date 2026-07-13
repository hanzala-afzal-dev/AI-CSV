import {
  conversationListQuerySchema,
  createConversationRequestSchema
} from "@agentic-csv/contracts";
import {
  conversationResponse,
  decodeConversationCursor,
  safeConversation,
  safeConversationPage
} from "@/server/conversation-http";
import {
  authenticateBrowserRequest,
  authorizeBrowserMutation,
  errorResponse,
  readJson
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const url = new URL(request.url);
    const query = conversationListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries())
    );
    const page = await getRuntime().conversationService.list({
      userId: context.session.userId,
      status: query.view,
      cursor: decodeConversationCursor(query.cursor),
      limit: query.limit
    });
    return conversationResponse(
      safeConversationPage(page),
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function POST(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const body = createConversationRequestSchema.parse(await readJson(request));
    const conversation = await getRuntime().conversationService.create({
      userId: context.session.userId,
      ...(body.title === undefined ? {} : { title: body.title })
    });
    return conversationResponse(
      { conversation: safeConversation(conversation) },
      context.correlationId,
      201,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
