import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";

export default function ResendVerificationPage() {
  return (
    <AuthShell
      title="Verify your email"
      description="Request a fresh verification link for an account awaiting confirmation."
      footer={
        <Link className="font-semibold text-action hover:underline" href="/login">
          Return to sign in
        </Link>
      }
    >
      <RecoveryForm mode="verification" />
    </AuthShell>
  );
}
