"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { FormField } from "@/components/auth/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function PrivacyDeletionDialog({
  open,
  scope,
  resourceName,
  onOpenChange,
  onConfirm
}: {
  readonly open: boolean;
  readonly scope: "dataset" | "account";
  readonly resourceName: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (
    currentPassword: string,
    confirmation: string | null
  ) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setPending(false);
      setError(undefined);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(undefined);
    try {
      await onConfirm(
        String(data.get("currentPassword") ?? ""),
        account ? String(data.get("confirmation") ?? "") : null
      );
      form.reset();
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Deletion could not be scheduled."
      );
    } finally {
      setPending(false);
    }
  }

  const account = scope === "account";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={account ? "Delete account" : "Delete dataset"}
      description={
        account
          ? "This permanently removes your account and every owned dataset, conversation, credential, memory, and analysis artifact."
          : "This permanently removes the CSV, profiles, analyses, memories, cached results, and vector data. Conversation text is retained."
      }
    >
      <form className="settings-form" onSubmit={submit}>
        {error ? (
          <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
            {error}
          </Alert>
        ) : null}
        <p className="text-sm leading-6 text-muted">
          {account
            ? "Account deletion starts immediately and signs out every active session."
            : `"${resourceName}" cannot be recovered after deletion completes.`}
        </p>
        {account ? (
          <FormField
            id="accountDeletionConfirmation"
            name="confirmation"
            label='Type "DELETE" to confirm'
            pattern="DELETE"
            autoComplete="off"
            required
          />
        ) : null}
        <FormField
          id={account ? "accountDeletionPassword" : "datasetDeletionPassword"}
          name="currentPassword"
          type="password"
          label="Current password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
            {pending ? "Scheduling" : account ? "Delete account" : "Delete dataset"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
