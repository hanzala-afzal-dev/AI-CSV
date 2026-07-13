"use client";

import { useState } from "react";
import { LoaderCircle, Monitor, Smartphone, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authenticatedMutation } from "@/features/identity/api";

export interface SessionListItem {
  readonly id: string;
  readonly current: boolean;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly absoluteExpiresAt: string;
}

export function SessionList({
  initialSessions
}: {
  readonly initialSessions: readonly SessionListItem[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<string>();
  async function revoke(id: string) {
    setPendingId(id);
    setError(undefined);
    try {
      await authenticatedMutation(`/api/v1/me/sessions/${id}`, "DELETE");
      const current = sessions.find((session) => session.id === id)?.current;
      if (current) window.location.assign("/login");
      else setSessions((items) => items.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Session could not be revoked.");
    } finally {
      setPendingId(undefined);
    }
  }
  return (
    <div className="grid gap-3">
      {error ? (
        <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
          {error}
        </Alert>
      ) : null}
      {sessions.map((session) => {
        const mobile = /mobile|android|iphone/i.test(session.userAgent ?? "");
        const Icon = mobile ? Smartphone : Monitor;
        return (
          <article className="session-row" key={session.id}>
            <div className="flex min-w-0 items-start gap-3">
              <span className="session-icon">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">
                    {browserName(session.userAgent)}
                  </h3>
                  {session.current ? <span className="status-badge">Current</span> : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Last active {formatDate(session.lastSeenAt)}
                </p>
              </div>
            </div>
            <Button
              aria-label="Revoke session"
              title="Revoke session"
              variant="ghost"
              size="icon"
              disabled={pendingId === session.id}
              onClick={() => void revoke(session.id)}
            >
              {pendingId === session.id ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <X size={17} />
              )}
            </Button>
          </article>
        );
      })}
      {sessions.length === 0 ? (
        <p className="text-sm text-muted">No active sessions.</p>
      ) : null}
    </div>
  );
}

function browserName(value: string | null): string {
  if (!value) return "Unknown browser";
  if (value.includes("Firefox")) return "Firefox";
  if (value.includes("Edg/")) return "Microsoft Edge";
  if (value.includes("Chrome")) return "Chrome";
  if (value.includes("Safari")) return "Safari";
  return "Browser session";
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
