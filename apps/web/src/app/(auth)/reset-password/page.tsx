import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TokenActionForm } from "@/components/auth/token-action-form";

export default async function ResetPasswordPage({
  searchParams
}: {
  readonly searchParams: Promise<{ readonly token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      description="Completing this reset revokes every active session for the account."
      footer={
        <Link className="font-semibold text-action hover:underline" href="/login">
          Return to sign in
        </Link>
      }
    >
      <TokenActionForm mode="reset" token={token} />
    </AuthShell>
  );
}
