import { emailRequestSchema } from "@agentic-csv/contracts";
import {
  errorResponse,
  genericAcceptedMessage,
  protectPublicAuthRequest,
  readJson
} from "@/server/http";
import { identityResponse } from "@/server/identity-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const body = emailRequestSchema.parse(await readJson(request));
    await protectPublicAuthRequest(request, "recovery", body.email);
    await getRuntime().identityService.requestEmailVerification(body.email);
    return identityResponse({ message: genericAcceptedMessage }, correlationId, 202);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
