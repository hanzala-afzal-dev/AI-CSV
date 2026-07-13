"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { authenticatedMutation } from "@/features/identity/api";

export function ProfileForm({ displayName }: { readonly displayName: string }) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await authenticatedMutation("/api/v1/me/profile", "PATCH", {
        displayName: data.get("displayName")
      });
      setMessage("Profile updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
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
        id="displayName"
        name="displayName"
        label="Display name"
        defaultValue={displayName}
        autoComplete="name"
        required
      />
      <Button className="justify-self-start" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <Save size={17} />
        )}
        Save profile
      </Button>
    </form>
  );
}
