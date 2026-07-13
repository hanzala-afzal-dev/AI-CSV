"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { publicMutation } from "@/features/identity/api";

export function RecoveryForm({ mode }: { readonly mode: "password" | "verification" }) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const path =
      mode === "password"
        ? "/api/v1/auth/password-reset/request"
        : "/api/v1/auth/email-verification/request";
    try {
      const result = await publicMutation<{ data: { message: string } }>(path, {
        email: data.get("email")
      });
      setMessage(result.data.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="grid gap-5" onSubmit={submit}>
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
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
      />
      <Button disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <Mail size={17} />
        )}
        {mode === "password" ? "Send reset link" : "Send verification link"}
      </Button>
    </form>
  );
}
