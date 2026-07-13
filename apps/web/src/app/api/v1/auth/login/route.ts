import { loginRequestSchema } from "@agentic-csv/contracts";
import {
  clearSessionCookie,
  errorResponse,
  getSessionCookie,
  protectAuthenticatedLogin,
  protectPublicAuthRequest,
  readJson,
  sessionMetadata,
  setSessionCookie
} from "@/server/http";
import { identityResponse, safeSession, safeUser } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const body = loginRequestSchema.parse(await readJson(request));
    await protectPublicAuthRequest(request, "login", body.email);
    const previousSessionToken = getSessionCookie(request);
    const credentials = await getRuntime().identityService.login({
      ...body,
      metadata: sessionMetadata(request)
    });
    try {
      await protectAuthenticatedLogin(credentials.session.userId);
    } catch (error) {
      await getRuntime().identityService.logout(credentials.sessionToken);
      throw error;
    }
    const response = identityResponse(
      {
        user: safeUser(credentials.session.user),
        session: safeSession(credentials.session),
        csrfToken: credentials.csrfToken
      },
      correlationId
    );
    if (previousSessionToken) {
      await getRuntime().identityService.logout(previousSessionToken);
    }
    clearSessionCookie(response);
    setSessionCookie(response, credentials.sessionToken);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
