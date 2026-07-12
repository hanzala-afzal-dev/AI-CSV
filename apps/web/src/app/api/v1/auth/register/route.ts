import { registerRequestSchema } from "@agentic-csv/contracts";
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
    const body = registerRequestSchema.parse(await readJson(request));
    await protectPublicAuthRequest(request, "register", body.email);
    await getRuntime().identityService.register(body);
    return identityResponse({ message: genericAcceptedMessage }, correlationId, 202);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
