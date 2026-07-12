import Link from "next/link";
import type { ReactNode } from "react";
import { DatabaseZap } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  footer
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-ink"
        >
          <span className="grid size-9 place-items-center rounded-md bg-action text-white">
            <DatabaseZap aria-hidden="true" size={19} />
          </span>
          Agentic CSV Analyst
        </Link>
        <section className="rounded-md border border-line bg-panel p-6 shadow-panel sm:p-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </header>
          {children}
        </section>
        <div className="mt-5 text-center text-sm text-muted">{footer}</div>
      </div>
    </main>
  );
}
