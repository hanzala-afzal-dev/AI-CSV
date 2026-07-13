"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, MailCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { authenticatedMutation } from "@/features/identity/api";

export function EmailChangeForm({
  currentEmail,
  pendingEmail
}: {
  readonly currentEmail: string;
  readonly pendingEmail: string | null;
}) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await authenticatedMutation("/api/v1/me/email-change", "POST", {
        email: data.get("email"),
        currentPassword: data.get("currentPassword")
      });
      setMessage("Verification sent to the new address.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Email change failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="settings-form" onSubmit={submit}>
      {pendingEmail ? <Alert>Pending verification: {pendingEmail}</Alert> : null}
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
        id="newEmail"
        name="email"
        type="email"
        label="New email"
        defaultValue={currentEmail}
        autoComplete="email"
        required
      />
      <FormField
        id="emailPassword"
        name="currentPassword"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
      />
      <Button className="justify-self-start" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <MailCheck size={17} />
        )}
        Verify new email
      </Button>
    </form>
  );
}
