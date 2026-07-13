"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import type {
  ProviderModelContract,
  ProviderSettingsContract,
  ProviderPreferenceContract
} from "@agentic-csv/contracts";
import { reasoningEffortSchema } from "@agentic-csv/contracts";
import { ProviderCredentialStatus } from "@/components/settings/provider-credential-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { authenticatedMutation, authenticatedQuery } from "@/features/identity/api";

interface ApiEnvelope<T> {
  readonly data: T;
}

interface ProviderMutationData {
  readonly settings: ProviderSettingsContract;
  readonly models: readonly ProviderModelContract[];
}

type PendingAction = "credential" | "validate" | "delete" | "models" | "preference";

export function OpenAiProviderSettings({
  initialSettings,
  requestedDefault
}: {
  readonly initialSettings: ProviderSettingsContract;
  readonly requestedDefault: {
    readonly modelId: string;
    readonly reasoningEffort: ProviderPreferenceContract["reasoningEffort"];
  };
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [models, setModels] = useState<readonly ProviderModelContract[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    initialSettings.preference?.modelId ?? ""
  );
  const [reasoningEffort, setReasoningEffort] = useState(
    initialSettings.preference?.reasoningEffort ?? "medium"
  );
  const [pending, setPending] = useState<PendingAction>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const configured = settings.credential.configured;
  const activeModel = models.find((model) => model.id === selectedModel);
  const requestedDefaultModel = models.find(
    (model) => model.id === requestedDefault.modelId
  );
  const requestedDefaultAvailable = Boolean(
    requestedDefaultModel?.reasoningEfforts.includes(requestedDefault.reasoningEffort)
  );

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedKey = apiKey;
    setApiKey("");
    begin("credential");
    try {
      const response = await authenticatedMutation<ApiEnvelope<ProviderMutationData>>(
        "/api/v1/settings/providers/openai/credential",
        "PUT",
        {
          apiKey: submittedKey
        }
      );
      applyProviderData(response.data);
      setMessage(configured ? "OpenAI key replaced." : "OpenAI key configured.");
    } catch (cause) {
      setFailure(cause, "The OpenAI key could not be saved.");
    } finally {
      setPending(undefined);
    }
  }

  async function revalidate() {
    begin("validate");
    try {
      const response = await authenticatedMutation<ApiEnvelope<ProviderMutationData>>(
        "/api/v1/settings/providers/openai/validate",
        "POST",
        {}
      );
      applyProviderData(response.data);
      setMessage("OpenAI key validated.");
    } catch (cause) {
      await refreshSafeSettings();
      setFailure(cause, "The OpenAI key could not be validated.");
    } finally {
      setPending(undefined);
    }
  }

  async function loadModels() {
    begin("models");
    try {
      const response = await authenticatedQuery<
        ApiEnvelope<{ readonly models: readonly ProviderModelContract[] }>
      >("/api/v1/settings/providers/openai/models");
      setModels(response.data.models);
      setCatalogLoaded(true);
      syncSelection(response.data.models, settings.preference);
      setMessage("Compatible model catalog refreshed.");
    } catch (cause) {
      setFailure(cause, "Compatible models could not be loaded.");
    } finally {
      setPending(undefined);
    }
  }

  async function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin("preference");
    try {
      const response = await authenticatedMutation<ApiEnvelope<ProviderMutationData>>(
        "/api/v1/settings/providers/openai/preferences",
        "PUT",
        {
          modelId: selectedModel,
          reasoningEffort
        }
      );
      applyProviderData(response.data);
      setMessage("Model preferences saved.");
    } catch (cause) {
      await refreshSafeSettings();
      setFailure(cause, "Model preferences could not be saved.");
    } finally {
      setPending(undefined);
    }
  }

  async function deleteCredential() {
    begin("delete");
    try {
      const response = await authenticatedMutation<
        ApiEnvelope<{ readonly settings: ProviderSettingsContract }>
      >("/api/v1/settings/providers/openai/credential", "DELETE");
      setSettings(response.data.settings);
      setModels([]);
      setCatalogLoaded(false);
      setSelectedModel("");
      setReasoningEffort("medium");
      setConfirmDelete(false);
      setMessage("Encrypted OpenAI key removed.");
    } catch (cause) {
      setFailure(cause, "The OpenAI key could not be removed.");
    } finally {
      setPending(undefined);
    }
  }

  function begin(action: PendingAction) {
    setPending(action);
    setError(undefined);
    setMessage(undefined);
  }

  function applyProviderData(data: ProviderMutationData) {
    setSettings(data.settings);
    setModels(data.models);
    setCatalogLoaded(true);
    syncSelection(data.models, data.settings.preference);
  }

  async function refreshSafeSettings() {
    try {
      const response = await authenticatedQuery<
        ApiEnvelope<{ readonly settings: ProviderSettingsContract }>
      >("/api/v1/settings/providers/openai");
      setSettings(response.data.settings);
      if (response.data.settings.credential.status !== "valid") {
        setModels([]);
        setCatalogLoaded(false);
      }
    } catch {
      // Preserve the original provider error when this best-effort refresh fails.
    }
  }

  function syncSelection(
    nextModels: readonly ProviderModelContract[],
    preference: ProviderPreferenceContract | null
  ) {
    const preferred = preference
      ? nextModels.find((model) => model.id === preference.modelId)
      : undefined;
    const model = preferred ?? nextModels[0];
    setSelectedModel(model?.id ?? "");
    setReasoningEffort(
      preferred && preference
        ? preference.reasoningEffort
        : ((model?.reasoningEfforts.includes("medium")
            ? "medium"
            : model?.reasoningEfforts[0]) ?? "medium")
    );
  }

  function setFailure(cause: unknown, fallback: string) {
    setError(cause instanceof Error ? cause.message : fallback);
  }

  function changeModel(modelId: string) {
    const model = models.find((candidate) => candidate.id === modelId);
    setSelectedModel(modelId);
    setReasoningEffort(
      (model?.reasoningEfforts.includes("medium")
        ? "medium"
        : model?.reasoningEfforts[0]) ?? "medium"
    );
  }

  return (
    <div className="settings-sections">
      <div aria-live="polite" className="grid gap-3">
        {message ? (
          <Alert className="border-success/30 bg-success-soft text-success-strong">
            {message}
          </Alert>
        ) : null}
        {error ? (
          <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
            {error}
          </Alert>
        ) : null}
      </div>

      <section className="settings-section">
        <header>
          <h2>OpenAI API key</h2>
          <p>
            The key is validated server-side and stored with authenticated encryption.
          </p>
        </header>

        <ProviderCredentialStatus credential={settings.credential} />

        <form className="settings-form" onSubmit={saveCredential}>
          <div className="grid gap-2">
            <Label htmlFor="openaiApiKey">
              {configured ? "Replacement API key" : "API key"}
            </Label>
            <Input
              id="openaiApiKey"
              name="apiKey"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              minLength={20}
              maxLength={512}
              required
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={Boolean(pending) || apiKey.length < 20} type="submit">
              {pending === "credential" ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : configured ? (
                <RefreshCw size={17} />
              ) : (
                <KeyRound size={17} />
              )}
              {configured ? "Validate and replace" : "Validate and save"}
            </Button>
            {configured ? (
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(pending)}
                onClick={() => void revalidate()}
              >
                {pending === "validate" ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
                Revalidate
              </Button>
            ) : null}
          </div>
        </form>

        {configured ? (
          <div className="grid max-w-xl gap-3 border-t border-line pt-5">
            {confirmDelete ? (
              <div className="grid gap-3" role="alert">
                <p className="text-sm text-danger-strong">
                  Remove the encrypted key and saved model preferences?
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={Boolean(pending)}
                    onClick={() => void deleteCredential()}
                  >
                    {pending === "delete" ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                      <Trash2 size={17} />
                    )}
                    Remove key
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(pending)}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="justify-self-start"
                type="button"
                variant="ghost"
                disabled={Boolean(pending)}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={17} />
                Remove saved key
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <section className="settings-section">
        <header>
          <h2>Model and reasoning</h2>
          <p>Only compatible model IDs accessible to this API key are available.</p>
        </header>
        {!configured ? (
          <p className="text-sm text-muted">Configure a valid API key first.</p>
        ) : (
          <div className="grid max-w-xl gap-5">
            <Button
              className="justify-self-start"
              type="button"
              variant="secondary"
              disabled={Boolean(pending)}
              onClick={() => void loadModels()}
            >
              {pending === "models" ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <RefreshCw size={17} />
              )}
              {models.length > 0 ? "Refresh compatible models" : "Load compatible models"}
            </Button>

            {catalogLoaded && models.length === 0 ? (
              <Alert className="border-warning/30 bg-warning-soft text-warning-strong">
                This key has no models supported by the current compatibility policy.
              </Alert>
            ) : null}

            {catalogLoaded && models.length > 0 && !requestedDefaultAvailable ? (
              <Alert className="border-warning/30 bg-warning-soft text-warning-strong">
                The requested default {requestedDefault.modelId} with{" "}
                {formatEffort(requestedDefault.reasoningEffort)} reasoning is not
                available to this key. Select one of the validated alternatives below.
              </Alert>
            ) : null}

            {models.length > 0 ? (
              <form className="settings-form" onSubmit={savePreference}>
                <div className="grid gap-2">
                  <Label htmlFor="providerModel">Model</Label>
                  <Select
                    id="providerModel"
                    value={selectedModel}
                    onChange={(event) => changeModel(event.target.value)}
                    disabled={Boolean(pending)}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reasoningEffort">Reasoning effort</Label>
                  <Select
                    id="reasoningEffort"
                    value={reasoningEffort}
                    onChange={(event) =>
                      setReasoningEffort(reasoningEffortSchema.parse(event.target.value))
                    }
                    disabled={Boolean(pending) || !activeModel}
                  >
                    {(activeModel?.reasoningEfforts ?? []).map((effort) => (
                      <option key={effort} value={effort}>
                        {formatEffort(effort)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  className="justify-self-start"
                  type="submit"
                  disabled={Boolean(pending) || !selectedModel || !activeModel}
                >
                  {pending === "preference" ? (
                    <LoaderCircle className="animate-spin" size={17} />
                  ) : (
                    <Save size={17} />
                  )}
                  Save model preferences
                </Button>
              </form>
            ) : settings.preference ? (
              <div className="provider-preference-summary">
                <span>{settings.preference.modelId}</span>
                <span>{formatEffort(settings.preference.reasoningEffort)} reasoning</span>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="settings-section">
        <header>
          <h2>Provider usage</h2>
          <p>
            This open-source application does not bill you. Requests made with your key
            may incur charges on your OpenAI account.
          </p>
        </header>
      </section>
    </div>
  );
}

function formatEffort(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
