import { passwordChangeRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  errorResponse,
  readJson,
  sessionMetadata,
  setSessionCookie
} from "@/server/http";
import { identityResponse, safeSession } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    const body = passwordChangeRequestSchema.parse(await readJson(request));
    const credentials = await getRuntime().identityService.changePassword({
      userId: context.session.userId,
      currentSessionId: context.session.id,
      metadata: sessionMetadata(request),
      ...body
    });
    const response = identityResponse(
      { session: safeSession(credentials.session), csrfToken: credentials.csrfToken },
      context.correlationId,
      200,
      context.responseHeaders
    );
    setSessionCookie(response, credentials.sessionToken);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
