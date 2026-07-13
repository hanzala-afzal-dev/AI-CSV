import { passwordResetConfirmRequestSchema } from "@agentic-csv/contracts";
import { errorResponse, protectPublicAuthRequest, readJson } from "@/server/http";
import { identityResponse } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const body = passwordResetConfirmRequestSchema.parse(await readJson(request));
    await protectPublicAuthRequest(request, "recovery", body.token);
    await getRuntime().identityService.confirmPasswordReset(body.token, body.newPassword);
    return identityResponse({ reset: true }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
