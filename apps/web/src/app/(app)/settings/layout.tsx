import Link from "next/link";
import type { ReactNode } from "react";
import { KeyRound, UserRound } from "lucide-react";

export default function SettingsLayout({ children }: { readonly children: ReactNode }) {
  return (
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
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
