import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { identityResponse } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    const csrfToken = await getRuntime().identityService.issueCsrf(context.session);
    return identityResponse({ authenticated: true, csrfToken }, context.correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
