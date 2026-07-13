export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export interface SecureTokenService {
  issue(scope: string): { readonly plaintext: string; readonly hash: string };
  hash(scope: string, plaintext: string): string;
  matches(scope: string, plaintext: string, expectedHash: string): boolean;
}

export interface IdentityMailer {
  sendEmailVerification(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void>;
  sendEmailChangeVerification(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void>;
  sendPasswordReset(input: {
    readonly email: string;
    readonly displayName: string;
    readonly token: string;
  }): Promise<void>;
}

export interface LoginIdentity {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly status: string;
  readonly emailVerified: boolean;
}

export interface SafeIdentityUser {
  readonly id: string;
  readonly email: string;
  readonly pendingEmail: string | null;
  readonly displayName: string;
  readonly emailVerified: boolean;
}

export interface AuthenticatedSession {
  readonly id: string;
  readonly userId: string;
  readonly csrfHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly user: SafeIdentityUser;
}

export interface SessionSummary {
  readonly id: string;
  readonly current: boolean;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface IdentityRepository {
  register(input: {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
    readonly passwordHash: string;
    readonly verificationHash: string;
    readonly verificationExpiresAt: Date;
  }): Promise<{ readonly created: boolean }>;
  findLoginIdentity(email: string): Promise<LoginIdentity | null>;
  createSession(input: {
    readonly sessionId: string;
    readonly userId: string;
    readonly tokenHash: string;
    readonly csrfHash: string;
    readonly userAgent: string | null;
    readonly ipHash: string | null;
    readonly idleExpiresAt: Date;
    readonly absoluteExpiresAt: Date;
    readonly rotatedFromId: string | null;
    readonly now: Date;
  }): Promise<void>;
  authenticateSession(input: {
    readonly tokenHash: string;
    readonly now: Date;
    readonly idleTtlSeconds: number;
  }): Promise<AuthenticatedSession | null>;
  rotateCsrf(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly csrfHash: string;
  }): Promise<boolean>;
  revokeByTokenHash(tokenHash: string, now: Date): Promise<void>;
  getUser(userId: string): Promise<SafeIdentityUser | null>;
  getPasswordHash(userId: string): Promise<string | null>;
  updateProfile(
    userId: string,
    displayName: string,
    now: Date
  ): Promise<SafeIdentityUser>;
  prepareEmailChange(input: {
    readonly userId: string;
    readonly email: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now: Date;
  }): Promise<boolean>;
  issueEmailVerification(input: {
    readonly email: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now: Date;
  }): Promise<{ readonly email: string; readonly displayName: string } | null>;
  consumeEmailVerification(tokenHash: string, now: Date): Promise<boolean>;
  issuePasswordReset(input: {
    readonly email: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now: Date;
  }): Promise<{ readonly email: string; readonly displayName: string } | null>;
  resetPassword(input: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly now: Date;
  }): Promise<boolean>;
  changePassword(input: {
    readonly userId: string;
    readonly passwordHash: string;
    readonly now: Date;
  }): Promise<void>;
  listSessions(
    userId: string,
    currentSessionId: string
  ): Promise<readonly SessionSummary[]>;
  revokeSession(userId: string, sessionId: string, now: Date): Promise<boolean>;
}
