import { accountDeletionRequestSchema } from "@agentic-csv/contracts";
import {
  authenticateBrowserRequest,
  authorizeBrowserMutation,
  clearSessionCookie,
  errorResponse,
  protectPrivacyDeletion,
  readJson
} from "@/server/http";
import { identityResponse, safeSession, safeUser } from "@/server/identity-http";
import { safePrivacyDeletion } from "@/server/privacy-http";
import { getRuntime } from "@/server/runtime";

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

export async function DELETE(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const body = accountDeletionRequestSchema.parse(await readJson(request));
    const privacyHeaders = await protectPrivacyDeletion(
      request,
      context.session.userId,
      "account"
    );
    const runtime = getRuntime();
    await runtime.identityService.reauthenticate(
      context.session.userId,
      body.currentPassword
    );
    const deletion = await runtime.privacyDeletionService.scheduleAccount({
      userId: context.session.userId,
      clientRequestId: body.clientRequestId,
      correlationId: context.correlationId
    });
    const response = identityResponse(
      { deletion: safePrivacyDeletion(deletion) },
      context.correlationId,
      202,
      { ...context.responseHeaders, ...privacyHeaders }
    );
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
