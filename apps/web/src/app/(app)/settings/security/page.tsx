import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { SessionList, type SessionListItem } from "@/components/settings/session-list";
import { requireCurrentSession } from "@/server/current-session";
import { getRuntime } from "@/server/runtime";

export default async function SecuritySettingsPage() {
  const current = await requireCurrentSession();
  const sessions = await getRuntime().identityService.listSessions(
    current.userId,
    current.id
  );
  const items: SessionListItem[] = sessions.map((session) => ({
    id: session.id,
    current: session.current,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString()
  }));
  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header>
          <h2>Password</h2>
          <p>
            Changing your password rotates this session and revokes every other session.
          </p>
        </header>
        <PasswordChangeForm />
      </section>
      <section className="settings-section">
        <header>
          <h2>Active sessions</h2>
          <p>Revoke devices you no longer recognize or use.</p>
        </header>
        <SessionList initialSessions={items} />
      </section>
    </div>
  );
}
