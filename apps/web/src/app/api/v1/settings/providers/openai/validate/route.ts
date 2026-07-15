import { emptyJsonRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  errorResponse,
  protectProviderValidation,
  readJson
} from "@/server/http";
import { providerResponse, safeProviderResult } from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const validationHeaders = await protectProviderValidation(context.session.userId);
    emptyJsonRequestSchema.parse(await readJson(request));
    const result = await getRuntime().providerSettingsService.revalidateCredential({
      userId: context.session.userId,
      correlationId: context.correlationId
    });
    return providerResponse(safeProviderResult(result), context.correlationId, 200, {
      ...context.responseHeaders,
      ...validationHeaders
    });
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
