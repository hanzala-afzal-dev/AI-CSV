import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { identityResponse, safeSession, safeUser } from "@/server/identity-http";

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    return identityResponse(
      { user: safeUser(context.session.user), session: safeSession(context.session) },
      context.correlationId
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
