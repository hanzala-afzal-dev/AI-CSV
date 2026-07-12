import { NextResponse } from "next/server";
import type {
  AuthenticatedSession,
  SafeIdentityUser,
  SessionSummary
} from "@agentic-csv/application";

export function identityResponse(
  data: unknown,
  correlationId: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): NextResponse {
  return NextResponse.json({ ok: true, data, correlationId }, { status, headers });
}

export function safeUser(user: SafeIdentityUser) {
  return {
    id: user.id,
    email: user.email,
    pendingEmail: user.pendingEmail,
    displayName: user.displayName,
    emailVerified: user.emailVerified
  };
}

export function safeSession(session: AuthenticatedSession) {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString()
  };
}

export function safeSessionSummary(session: SessionSummary) {
  return {
    id: session.id,
    current: session.current,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString()
  };
}
