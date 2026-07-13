import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email. The response is the same whether or not an account exists."
      footer={
        <Link className="font-semibold text-action hover:underline" href="/login">
          Return to sign in
        </Link>
      }
    >
      <RecoveryForm mode="password" />
    </AuthShell>
  );
}
