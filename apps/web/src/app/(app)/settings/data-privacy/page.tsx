import { AccountDeletionControl } from "@/components/settings/account-deletion-control";

export default function DataPrivacySettingsPage() {
  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header>
          <h2>Data retention</h2>
          <p>
            Uploaded CSV files and derived analysis data remain private to your account
            until you delete the dataset or account.
          </p>
        </header>
      </section>
      <section className="settings-section border-danger/30">
        <header>
          <h2>Delete account</h2>
          <p>
            Deletion is permanent and covers database records, uploaded objects, queued
            derivatives, caches, and vector memory.
          </p>
        </header>
        <AccountDeletionControl />
      </section>
    </div>
  );
}
