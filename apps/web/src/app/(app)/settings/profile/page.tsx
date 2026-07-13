import { EmailChangeForm } from "@/components/settings/email-change-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { requireCurrentSession } from "@/server/current-session";

export default async function ProfileSettingsPage() {
  const session = await requireCurrentSession();
  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header>
          <h2>Profile</h2>
          <p>Used to identify your account throughout the application.</p>
        </header>
        <ProfileForm displayName={session.user.displayName} />
      </section>
      <section className="settings-section">
        <header>
          <h2>Email address</h2>
          <p>A new address becomes active only after verification.</p>
        </header>
        <EmailChangeForm
          currentEmail={session.user.email}
          pendingEmail={session.user.pendingEmail}
        />
      </section>
    </div>
  );
}
