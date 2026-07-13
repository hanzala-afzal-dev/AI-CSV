import { NextResponse } from "next/server";
import type {
  ProviderModel,
  ProviderSettingsResult,
  ProviderSettingsView
} from "@agentic-csv/application";

export function providerResponse(
  data: unknown,
  correlationId: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): NextResponse {
  return NextResponse.json({ ok: true, data, correlationId }, { status, headers });
}

export function safeProviderSettings(settings: ProviderSettingsView) {
  return {
    credential: {
      ...settings.credential,
      validatedAt: settings.credential.validatedAt?.toISOString() ?? null,
      updatedAt: settings.credential.updatedAt?.toISOString() ?? null
    },
    preference: settings.preference
      ? {
          ...settings.preference,
          modelValidatedAt: settings.preference.modelValidatedAt.toISOString()
        }
      : null
  };
}

export function safeProviderModels(models: readonly ProviderModel[]) {
  return models.map((model) => ({
    id: model.id,
    reasoningEfforts: [...model.reasoningEfforts]
  }));
}

export function safeProviderResult(result: ProviderSettingsResult) {
  return {
    settings: safeProviderSettings(result.settings),
    models: safeProviderModels(result.models)
  };
}
