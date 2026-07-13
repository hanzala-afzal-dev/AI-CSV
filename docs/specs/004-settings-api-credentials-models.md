# 004 — Settings, API Credentials and Model Selection

**Status:** Approved for implementation

## 1. Settings information architecture

The Settings page contains:

1. **Profile** — name and verified email.
2. **Security** — password change and session management.
3. **AI Provider** — OpenAI key, validation status, model and reasoning effort.
4. **Data & Privacy** — data deletion controls and retention summary.

## 2. OpenAI credential lifecycle

Supported actions:

- Add key.
- Validate key before or during save.
- Replace key.
- Revalidate key.
- Delete/revoke the local encrypted copy.

Operation semantics:

- `PUT .../credential` validates the submitted key first and atomically activates the replacement only
  after validation succeeds. An invalid replacement leaves the existing credential unchanged.
- `POST .../validate` revalidates only the already-saved credential. It never accepts a transient key.
- `GET .../models` is read-only. It may call OpenAI with the saved key but does not change credential or
  preference state.
- Deletion removes the encrypted secret material and provider preferences in one transaction. A safe
  audit event remains.

The UI accepts a full key only in a password-style input. After submission, the frontend must immediately clear the value. Subsequent reads return only:

```ts
type ProviderCredentialSummary = {
  provider: "openai";
  configured: boolean;
  last4: string | null;
  status: "unconfigured" | "validating" | "valid" | "invalid" | "revoked";
  validatedAt: string | null;
  updatedAt: string | null;
};
```

## 3. Secure storage design

### Development/self-hosted baseline

- The server reads a base64-encoded 256-bit `APP_ENCRYPTION_KEY` and an explicit
  `APP_ENCRYPTION_KEY_VERSION` from environment/secret injection.
- Previous versioned keys may be supplied through `APP_ENCRYPTION_PREVIOUS_KEYS` during rotation. New
  writes always use the current version; reads select a key by the stored version.
- Encrypt each provider key using AES-256-GCM with a unique 96-bit random nonce and 128-bit
  authentication tag.
- Bind associated authenticated data to `userId`, provider and credential record ID.
- Store ciphertext, nonce, authentication tag (if separate), algorithm and key version.
- Store a non-secret display suffix (`last4`) and optional keyed fingerprint for duplicate detection.

### Production recommendation

Use envelope encryption with a cloud KMS or secret manager:

- Per-record data-encryption key.
- Data key encrypted by KMS key-encryption key.
- Persist encrypted data key alongside ciphertext.
- Rotate KMS/key versions without exposing plaintext.

### Prohibited

- Plaintext database column.
- Browser `localStorage`, IndexedDB, cookies or frontend state persistence.
- React environment variables shipped to the browser.
- Logging request bodies on credential endpoints.
- Returning the full key after save.
- Reusing one static nonce.
- Activating or deleting a credential outside the transaction that records its audit event.

## 4. Validation

A server-side validation use case:

1. Decrypts the submitted/saved key only in process memory.
2. Calls a low-cost provider endpoint that confirms authentication and model access.
3. Uses a strict timeout and no broad retries for invalid credentials.
4. Maps provider errors to stable safe codes such as `PROVIDER_KEY_INVALID`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`.
5. Never forwards raw provider error payloads that may include sensitive request data.

Initial validation uses the authenticated `GET /v1/models` API. A successful response proves the key can
authenticate and supplies account-accessible model IDs without incurring a model inference request.
Validation has a strict timeout, no automatic retry and a dedicated fail-closed per-user Redis limit.

## 5. Model catalog

- Fetch account-accessible model IDs server-side using the user's decrypted key and intersect them with a
  version-controlled compatibility map.
- The initial implementation fetches model access on demand under the dedicated validation limit so
  revoked access is not hidden by stale entitlement data. Any later cache may contain only short-lived,
  non-secret model metadata scoped per user and must be invalidated on credential changes.
- Filter to models compatible with the Responses API and required structured/tool capabilities.
- Model IDs are data, not TypeScript enum constants; provider catalogs evolve.
- Persist selected `model_id`, `reasoning_effort`, optional `reasoning_mode` and validation timestamp.
- Catalog reads never return provider ownership metadata or any credential material.

## 6. Default selection

Requested default:

```text
model: gpt-5.5
reasoning effort: medium
```

This is an explicit product default, not a claim that the model is the provider's latest general
recommendation. Provider catalogs change, so deployments may revise the configured default after a
specification update and compatibility validation.

Rules:

- Apply this default for a new user only when the saved key can access it.
- If inaccessible or deprecated, do not silently fail chat runs.
- Present available compatible models and select a documented fallback only after validation; record that a fallback was applied.
- The global deployment may expose `DEFAULT_OPENAI_MODEL` and `DEFAULT_REASONING_EFFORT`, but user selection wins.
- The UI must show exact API model ID, not a misleading consumer-product label.

## 7. Supported reasoning values

Treat supported values as model-dependent. The UI obtains allowed values from a provider compatibility map and does not assume every model supports every effort.

## 8. Provider abstraction

OpenAI is the only MVP provider. Define a narrow provider port so future Gemini or Claude support does not change domain entities:

```ts
interface ProviderSettingsGateway {
  validateCredential(secret: SecretValue): Promise<CredentialValidationResult>;
  listCompatibleModels(secret: SecretValue): Promise<ProviderModel[]>;
}
```

Add the response-generation port in the agent/conversation phase that consumes it. Do not expand this
settings port or implement unused providers ahead of their owning phase.

## 9. Audit events

Persist safe events for credential add, replace, validation success/failure, deletion, automatic model
fallback and preference changes. Events contain user ID, event type, outcome, correlation ID, timestamps
and allow-listed non-secret metadata only. They never contain the key, ciphertext, nonce, authentication
tag, fingerprint, raw provider response or full model catalog.

## 10. Acceptance scenarios

```gherkin
Scenario: key is saved securely
  Given an authenticated user enters a valid OpenAI API key
  When the user saves the key
  Then the server validates it
  And stores only encrypted secret material and safe metadata
  And the response shows only the last four characters
  And the full key is absent from logs and browser persistence

Scenario: user replaces key
  Given a user has a configured key
  When the user submits a replacement
  Then the new key is validated before activation
  And the previous ciphertext is removed or made unusable
  And active chat runs use the new credential after the transaction completes

Scenario: model unavailable
  Given gpt-5.5 is configured as the requested default
  And the user's account cannot access it
  When the model catalog is validated
  Then Settings clearly marks the default unavailable
  And the user can select a compatible accessible model
```

## 11. References

- OpenAI states API keys must not be deployed in client-side environments and recommends routing requests through a backend: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- OpenAI documents model-dependent reasoning effort and `medium` as the default for `gpt-5.5`: https://developers.openai.com/api/docs/guides/reasoning
