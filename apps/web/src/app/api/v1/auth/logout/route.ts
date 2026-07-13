import { NextResponse } from "next/server";
import {
  authorizeBrowserMutation,
  clearSessionCookie,
  errorResponse,
  getSessionCookie,
  validateBrowserMutationRequest
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    validateBrowserMutationRequest(request, new URL(getRuntime().env.APP_URL).origin);
    const sessionToken = getSessionCookie(request);
    if (sessionToken) {
      const session =
        await getRuntime().identityService.authenticateSession(sessionToken);
      if (session) await authorizeBrowserMutation(request);
      await getRuntime().identityService.logout(sessionToken);
    }
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
