import { NextResponse } from "next/server";
import { z } from "zod";
import { SuggestionError } from "@agentic-csv/application";
import { authenticateBrowserRequest, errorResponse, HttpError } from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly conversationId: string }> }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const conversationId = idSchema.parse((await params).conversationId);
    const suggestions = await getRuntime().suggestionService.getForConversation(
      context.session.userId,
      conversationId
    );
    return NextResponse.json(
      { ok: true, data: suggestions, correlationId },
      { status: 200, headers: context.responseHeaders }
    );
  } catch (error) {
    if (error instanceof SuggestionError) {
      return errorResponse(new HttpError(404, error.code, error.message), correlationId);
    }
    return errorResponse(error, correlationId);
  }
}
