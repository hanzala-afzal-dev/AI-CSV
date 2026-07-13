import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentSession } from "@/server/current-session";

export default async function ProtectedLayout({
  children
}: {
  readonly children: ReactNode;
}) {
  const session = await requireCurrentSession();
  return (
    <AppShell displayName={session.user.displayName} email={session.user.email}>
      {children}
    </AppShell>
  );
}
