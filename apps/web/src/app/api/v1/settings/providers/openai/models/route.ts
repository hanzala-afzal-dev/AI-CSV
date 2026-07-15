import {
  authenticateBrowserRequest,
  errorResponse,
  protectProviderValidation
} from "@/server/http";
import { providerResponse, safeProviderModels } from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const validationHeaders = await protectProviderValidation(context.session.userId);
    const models = await getRuntime().providerSettingsService.listModels({
      userId: context.session.userId,
      correlationId: context.correlationId
    });
    return providerResponse(
      { models: safeProviderModels(models) },
      context.correlationId,
      200,
      validationHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
