import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "../src/identity/identity-service";
import type {
  AuthenticatedSession,
  IdentityMailer,
  IdentityRepository,
  PasswordHasher,
  SecureTokenService
} from "../src/identity/ports";

const now = new Date("2026-07-12T10:00:00Z");
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "alice@example.com",
  pendingEmail: null,
  displayName: "Alice",
  emailVerified: true
};

describe("IdentityService", () => {
  it("returns the same authentication error for missing and incorrect accounts", async () => {
    const missingRepository = repository();
    missingRepository.findLoginIdentity = vi.fn(async () => null);
    const missingHasher = hasher();
    const missing = service(missingRepository, missingHasher);
    await expect(
      missing.login({ email: user.email, password: "wrong", metadata: metadata() })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(missingHasher.verifyDummy).toHaveBeenCalledOnce();

    const existingRepository = repository();
    existingRepository.findLoginIdentity = vi.fn(async () => ({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash: "hash",
      status: "active",
      emailVerified: true
    }));
    const existingHasher = hasher(false);
    await expect(
      service(existingRepository, existingHasher).login({
        email: user.email,
        password: "wrong",
        metadata: metadata()
      })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("revokes old sessions and creates a rotated session after password change", async () => {
    const store = repository();
    store.getPasswordHash = vi.fn(async () => "old-hash");
    store.authenticateSession = vi.fn(async () => session("new-session"));
    const identity = service(store, hasher(true));
    const result = await identity.changePassword({
      userId: user.id,
      currentSessionId: "old-session",
      currentPassword: "old password value",
      newPassword: "new password value",
      metadata: metadata()
    });
    expect(store.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        passwordHash: "hashed:new password value"
      })
    );
    expect(store.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ rotatedFromId: "old-session" })
    );
    expect(result.session.id).toBe("new-session");
  });
});

function service(store: IdentityRepository, passwordHasher: PasswordHasher) {
  return new IdentityService(
    store,
    passwordHasher,
    tokenService(),
    mailer(),
    {
      sessionIdleTtlSeconds: 1800,
      sessionAbsoluteTtlSeconds: 604800,
      verificationTtlSeconds: 86400,
      passwordResetTtlSeconds: 3600
    },
    () => now
  );
}

function hasher(valid = true): PasswordHasher {
  return {
    hash: vi.fn(async (password: string) => `hashed:${password}`),
    verify: vi.fn(async () => valid),
    verifyDummy: vi.fn(async () => undefined)
  };
}

function tokenService(): SecureTokenService {
  let sequence = 0;
  return {
    issue: vi.fn((scope: string) => ({
      plaintext: `${scope}-token-${++sequence}`.padEnd(32, "x"),
      hash: `${scope}-hash-${sequence}`.padEnd(64, "x")
    })),
    hash: vi.fn((scope: string, plaintext: string) => `${scope}:${plaintext}`),
    matches: vi.fn(() => true)
  };
}

function mailer(): IdentityMailer {
  return {
    sendEmailVerification: vi.fn(async () => undefined),
    sendEmailChangeVerification: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(async () => undefined)
  };
}

function metadata() {
  return { userAgent: "Test browser", ipHash: "ip-hash" };
}

function session(id: string): AuthenticatedSession {
  return {
    id,
    userId: user.id,
    csrfHash: "csrf-hash",
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: new Date(now.getTime() + 1800000),
    absoluteExpiresAt: new Date(now.getTime() + 604800000),
    user
  };
}

function repository(): IdentityRepository {
  return {
    register: vi.fn(async () => ({ created: true })),
    findLoginIdentity: vi.fn(async () => null),
    createSession: vi.fn(async () => undefined),
    authenticateSession: vi.fn(async () => session("session")),
    rotateCsrf: vi.fn(async () => true),
    revokeByTokenHash: vi.fn(async () => undefined),
    getUser: vi.fn(async () => user),
    getPasswordHash: vi.fn(async () => "hash"),
    updateProfile: vi.fn(async () => user),
    prepareEmailChange: vi.fn(async () => true),
    issueEmailVerification: vi.fn(async () => null),
    consumeEmailVerification: vi.fn(async () => true),
    issuePasswordReset: vi.fn(async () => null),
    resetPassword: vi.fn(async () => true),
    changePassword: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    revokeSession: vi.fn(async () => true)
  };
}
