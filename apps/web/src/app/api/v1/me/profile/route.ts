import { profileUpdateRequestSchema } from "@agentic-csv/contracts";
import { authorizeBrowserMutation, errorResponse, readJson } from "@/server/http";
import { identityResponse, safeUser } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function PATCH(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    const body = profileUpdateRequestSchema.parse(await readJson(request));
    const user = await getRuntime().identityService.updateProfile(
      context.session.userId,
      body.displayName
    );
    return identityResponse(
      { user: safeUser(user) },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
