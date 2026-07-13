import { CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import type { ProviderCredentialSummaryContract } from "@agentic-csv/contracts";

export function ProviderCredentialStatus({
  credential
}: {
  readonly credential: ProviderCredentialSummaryContract;
}) {
  const valid = credential.status === "valid";
  const unconfigured = !credential.configured;
  return (
    <div className="provider-status-row">
      <span
        aria-hidden="true"
        className={
          valid
            ? "provider-status-icon text-success"
            : unconfigured
              ? "provider-status-icon text-muted"
              : "provider-status-icon text-danger"
        }
      >
        {valid ? (
          <CheckCircle2 size={19} />
        ) : unconfigured ? (
          <KeyRound size={19} />
        ) : (
          <ShieldAlert size={19} />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{statusLabel(credential)}</p>
        <p className="mt-1 text-xs text-muted">{statusDetail(credential)}</p>
      </div>
    </div>
  );
}

function statusLabel(credential: ProviderCredentialSummaryContract): string {
  if (!credential.configured) return "No API key configured";
  if (credential.status === "valid") return "Key validated";
  return "Key needs attention";
}

function statusDetail(credential: ProviderCredentialSummaryContract): string {
  if (!credential.configured) {
    return "A full key is accepted only during submission and is never returned.";
  }
  const suffix = credential.last4 ? `Key ending in ${credential.last4}.` : "Saved key.";
  if (credential.status === "invalid") {
    return `${suffix} Validation failed; replace or revalidate this key.`;
  }
  const validated = credential.validatedAt
    ? ` Last validated ${formatDate(credential.validatedAt)}.`
    : "";
  return `${suffix}${validated}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
