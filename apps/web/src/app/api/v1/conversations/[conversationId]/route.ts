import { NextResponse } from "next/server";
import { z } from "zod";
import { updateConversationRequestSchema } from "@agentic-csv/contracts";
import {
  conversationResponse,
  safeConversation,
  safeConversationDetail
} from "@/server/conversation-http";
import {
  authenticateBrowserRequest,
  authorizeBrowserMutation,
  errorResponse,
  readJson
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();
type RouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const conversationId = idSchema.parse((await params).conversationId);
    const detail = await getRuntime().conversationService.getDetail(
      context.session.userId,
      conversationId
    );
    return conversationResponse(
      safeConversationDetail(detail),
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const conversationId = idSchema.parse((await params).conversationId);
    const body = updateConversationRequestSchema.parse(await readJson(request));
    const conversation =
      "title" in body
        ? await getRuntime().conversationService.rename({
            userId: context.session.userId,
            conversationId,
            title: body.title
          })
        : await getRuntime().conversationService.setActiveDataset({
            userId: context.session.userId,
            conversationId,
            datasetVersionId: body.activeDatasetVersionId
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

export async function DELETE(request: Request, { params }: RouteContext) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const conversationId = idSchema.parse((await params).conversationId);
    await getRuntime().conversationService.delete(context.session.userId, conversationId);
    return new NextResponse(null, { status: 204, headers: context.responseHeaders });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
