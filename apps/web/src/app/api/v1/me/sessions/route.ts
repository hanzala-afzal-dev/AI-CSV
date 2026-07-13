import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { identityResponse, safeSessionSummary } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    const sessions = await getRuntime().identityService.listSessions(
      context.session.userId,
      context.session.id
    );
    return identityResponse(
      { sessions: sessions.map(safeSessionSummary) },
      context.correlationId
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
