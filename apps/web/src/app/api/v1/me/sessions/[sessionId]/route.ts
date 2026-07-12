import { NextResponse } from "next/server";
import { sessionIdSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  clearSessionCookie,
  errorResponse
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function DELETE(
  request: Request,
  { params }: { readonly params: Promise<{ readonly sessionId: string }> }
) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    const { sessionId } = await params;
    if (!sessionIdSchema.safeParse(sessionId).success)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Session identifier is invalid.",
            requestId: context.correlationId,
            details: {}
          }
        },
        { status: 422 }
      );
    const revoked = await getRuntime().identityService.revokeSession(
      context.session.userId,
      sessionId
    );
    if (!revoked)
      return NextResponse.json(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Session was not found.",
            requestId: context.correlationId,
            details: {}
          }
        },
        { status: 404 }
      );
    const response = new NextResponse(null, {
      status: 204,
      headers: context.responseHeaders
    });
    if (sessionId === context.session.id) clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
