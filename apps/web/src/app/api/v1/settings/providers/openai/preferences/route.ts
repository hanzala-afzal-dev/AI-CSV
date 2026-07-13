import { providerPreferenceUpdateRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  errorResponse,
  protectProviderValidation,
  readJson
} from "@/server/http";
import { providerResponse, safeProviderResult } from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export async function PUT(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const validationHeaders = await protectProviderValidation(context.session.userId);
    const body = providerPreferenceUpdateRequestSchema.parse(await readJson(request));
    const result = await getRuntime().providerSettingsService.updatePreference({
      userId: context.session.userId,
      modelId: body.modelId,
      reasoningEffort: body.reasoningEffort,
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
