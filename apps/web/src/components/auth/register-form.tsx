"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { publicMutation } from "@/features/identity/api";

export function RegisterForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmation")) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }
    try {
      const result = await publicMutation<{ data: { message: string } }>(
        "/api/v1/auth/register",
        {
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password")
        }
      );
      setMessage(result.data.message);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
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
        id="displayName"
        name="displayName"
        label="Name"
        autoComplete="name"
        required
      />
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Password"
        hint="Use at least 12 characters."
        autoComplete="new-password"
        minLength={12}
        required
      />
      <FormField
        id="confirmation"
        name="confirmation"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        minLength={12}
        required
      />
      <Button disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <UserPlus size={17} />
        )}
        Create account
      </Button>
    </form>
  );
}
