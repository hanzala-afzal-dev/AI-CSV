"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { publicMutation } from "@/features/identity/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await publicMutation("/api/v1/auth/login", {
        email: data.get("email"),
        password: data.get("password")
      });
      router.replace("/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
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
      <div className="grid gap-2">
        <FormField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
        />
        <Link
          href="/forgot-password"
          className="justify-self-end text-sm font-semibold text-action hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <LogIn size={17} />
        )}
        Sign in
      </Button>
    </form>
  );
}
