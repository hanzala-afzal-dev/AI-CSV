import { OpenAiProviderSettings } from "@/components/settings/openai-provider-settings";
import { requireCurrentSession } from "@/server/current-session";
import { safeProviderSettings } from "@/server/provider-http";
import { getRuntime } from "@/server/runtime";

export default async function AiProviderSettingsPage() {
  const session = await requireCurrentSession();
  const runtime = getRuntime();
  const settings = await runtime.providerSettingsService.getSettings(session.userId);
  return (
    <OpenAiProviderSettings
      initialSettings={safeProviderSettings(settings)}
      requestedDefault={{
        modelId: runtime.env.DEFAULT_OPENAI_MODEL,
        reasoningEffort: runtime.env.DEFAULT_REASONING_EFFORT
      }}
    />
  );
}
