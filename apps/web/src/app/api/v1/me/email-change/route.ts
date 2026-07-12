import { emailChangeRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  errorResponse,
  readJson,
  sessionMetadata,
  setSessionCookie
} from "@/server/http";
import { identityResponse } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    const body = emailChangeRequestSchema.parse(await readJson(request));
    await getRuntime().identityService.requestEmailChange({
      userId: context.session.userId,
      displayName: context.session.user.displayName,
      ...body
    });
    const credentials = await getRuntime().identityService.rotateSession(
      context.session.userId,
      context.session.id,
      sessionMetadata(request)
    );
    const response = identityResponse(
      { pendingEmail: body.email, csrfToken: credentials.csrfToken },
      context.correlationId,
      202,
      context.responseHeaders
    );
    setSessionCookie(response, credentials.sessionToken);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
