import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { providerResponse, safeProviderSettings } from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const settings = await getRuntime().providerSettingsService.getSettings(
      context.session.userId
    );
    return providerResponse(
      { settings: safeProviderSettings(settings) },
      context.correlationId
    );
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
