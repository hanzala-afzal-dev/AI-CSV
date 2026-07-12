"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { publicMutation } from "@/features/identity/api";

export function TokenActionForm({
  mode,
  token
}: {
  readonly mode: "verify" | "reset";
  readonly token: string;
}) {
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "verify")
        await publicMutation("/api/v1/auth/email-verification/confirm", { token });
      else {
        if (data.get("password") !== data.get("confirmation"))
          throw new Error("Passwords do not match.");
        await publicMutation("/api/v1/auth/password-reset/confirm", {
          token,
          newPassword: data.get("password")
        });
      }
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }
  if (complete)
    return (
      <Alert className="border-success/30 bg-success-soft text-success-strong">
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 size={17} />
          {mode === "verify"
            ? "Email verified. You can now sign in."
            : "Password updated. You can now sign in."}
        </span>
      </Alert>
    );
  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error ? (
        <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
          {error}
        </Alert>
      ) : null}
      {!token ? (
        <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
          This link is missing its security token.
        </Alert>
      ) : null}
      {mode === "reset" ? (
        <>
          <FormField
            id="password"
            name="password"
            type="password"
            label="New password"
            minLength={12}
            autoComplete="new-password"
            required
          />
          <FormField
            id="confirmation"
            name="confirmation"
            type="password"
            label="Confirm password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </>
      ) : null}
      <Button disabled={pending || !token} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <KeyRound size={17} />
        )}
        {mode === "verify" ? "Verify email" : "Reset password"}
      </Button>
    </form>
  );
}
