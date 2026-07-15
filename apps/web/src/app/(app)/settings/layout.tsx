import Link from "next/link";
import type { ReactNode } from "react";
import { Bot, KeyRound, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentSession } from "@/server/current-session";

export default async function SettingsLayout({
  children
}: {
  readonly children: ReactNode;
}) {
  const session = await requireCurrentSession();
  return (
    <AppShell displayName={session.user.displayName} email={session.user.email}>
      <main className="page-shell">
        <header className="page-header">
          <div>
            <p className="page-eyebrow">Account</p>
            <h1>Settings</h1>
            <p>Manage your profile, credentials, and signed-in devices.</p>
          </div>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings">
            <Link href="/settings/profile">
              <UserRound size={17} />
              Profile
            </Link>
            <Link href="/settings/security">
              <KeyRound size={17} />
              Security
            </Link>
            <Link href="/settings/ai-provider">
              <Bot size={17} />
              AI Provider
            </Link>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </AppShell>
  );
}
