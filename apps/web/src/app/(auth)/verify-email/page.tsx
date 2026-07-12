import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TokenActionForm } from "@/components/auth/token-action-form";

export default async function VerifyEmailPage({
  searchParams
}: {
  readonly searchParams: Promise<{ readonly token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      title="Confirm your email"
      description="Verification activates a new account or confirms an email change."
      footer={
        <Link className="font-semibold text-action hover:underline" href="/login">
          Continue to sign in
        </Link>
      }
    >
      <TokenActionForm mode="verify" token={token} />
    </AuthShell>
  );
}
