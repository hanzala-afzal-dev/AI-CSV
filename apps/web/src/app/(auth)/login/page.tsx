import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession } from "@/server/current-session";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/app");
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue working with your datasets."
      footer={
        <>
          New here?{" "}
          <Link className="font-semibold text-action hover:underline" href="/register">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
      <p className="mt-5 text-center text-sm">
        <Link
          className="font-semibold text-action hover:underline"
          href="/resend-verification"
        >
          Resend verification email
        </Link>
      </p>
    </AuthShell>
  );
}
