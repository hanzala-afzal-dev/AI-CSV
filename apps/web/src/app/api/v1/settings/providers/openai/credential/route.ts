import { providerCredentialWriteRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeBrowserMutation,
  errorResponse,
  protectProviderValidation,
  readJson
} from "@/server/http";
import {
  providerResponse,
  safeProviderResult,
  safeProviderSettings
} from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export async function PUT(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const validationHeaders = await protectProviderValidation(context.session.userId);
    const body = providerCredentialWriteRequestSchema.parse(await readJson(request));
    const result = await getRuntime().providerSettingsService.saveCredential({
      userId: context.session.userId,
      apiKey: body.apiKey,
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

export async function DELETE(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const settings = await getRuntime().providerSettingsService.deleteCredential({
      userId: context.session.userId,
      correlationId: context.correlationId
    });
    return providerResponse(
      { settings: safeProviderSettings(settings) },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
