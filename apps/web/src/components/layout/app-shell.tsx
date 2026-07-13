import Link from "next/link";
import type { ReactNode } from "react";
import { DatabaseZap, LayoutDashboard, Settings, ShieldCheck } from "lucide-react";
import { LogoutButton } from "./logout-button";

export function AppShell({
  displayName,
  email,
  children
}: {
  readonly displayName: string;
  readonly email: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link href="/app" className="app-brand">
          <span className="grid size-9 place-items-center rounded-md bg-action text-white">
            <DatabaseZap size={19} />
          </span>
          <span>Agentic CSV Analyst</span>
        </Link>
        <nav className="app-nav" aria-label="Primary navigation">
          <Link href="/app">
            <LayoutDashboard size={17} />
            Workspace
          </Link>
          <Link href="/settings/profile">
            <Settings size={17} />
            Settings
          </Link>
          <Link href="/settings/security">
            <ShieldCheck size={17} />
            Security
          </Link>
        </nav>
        <div className="ml-1 lg:hidden">
          <LogoutButton />
        </div>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate text-sm font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <LogoutButton />
        </div>
      </aside>
      <div className="app-content">{children}</div>
    </div>
  );
}
