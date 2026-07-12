"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { authenticatedMutation } from "@/features/identity/api";

export function PasswordChangeForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmation")) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }
    try {
      await authenticatedMutation("/api/v1/me/password-change", "POST", {
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword")
      });
      setMessage("Password changed and other sessions revoked.");
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password change failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="settings-form" onSubmit={submit}>
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
      <FormField
        id="currentPassword"
        name="currentPassword"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
      />
      <FormField
        id="newPassword"
        name="newPassword"
        type="password"
        label="New password"
        minLength={12}
        autoComplete="new-password"
        required
      />
      <FormField
        id="passwordConfirmation"
        name="confirmation"
        type="password"
        label="Confirm new password"
        minLength={12}
        autoComplete="new-password"
        required
      />
      <Button className="justify-self-start" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <KeyRound size={17} />
        )}
        Change password
      </Button>
    </form>
  );
}
