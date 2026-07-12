import { FileSpreadsheet, MessageSquareText, Upload } from "lucide-react";

export default function WorkspacePage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1>Your data workspace</h1>
          <p>
            CSV profiling and conversations are the next product capabilities after
            account security.
          </p>
        </div>
      </header>
      <section className="workspace-empty">
        <span className="workspace-empty-icon">
          <FileSpreadsheet size={26} />
        </span>
        <h2>No active conversation</h2>
        <p>
          Your account boundary is ready. Dataset profiling will enable conversational
          analysis here.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="roadmap-pill">
            <Upload size={15} />
            Upload and profile
          </span>
          <span className="roadmap-pill">
            <MessageSquareText size={15} />
            Ask and analyze
          </span>
        </div>
      </section>
    </main>
  );
}
