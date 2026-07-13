import { randomUUID } from "node:crypto";
import { EmailAddress, IdentityUser } from "@agentic-csv/domain";
import { IdentityError } from "./identity-error";
import type {
  AuthenticatedSession,
  IdentityMailer,
  IdentityRepository,
  PasswordHasher,
  SafeIdentityUser,
  SecureTokenService,
  SessionSummary
} from "./ports";

export interface IdentityPolicy {
  readonly sessionIdleTtlSeconds: number;
  readonly sessionAbsoluteTtlSeconds: number;
  readonly verificationTtlSeconds: number;
  readonly passwordResetTtlSeconds: number;
}

export interface SessionMetadata {
  readonly userAgent: string | null;
  readonly ipHash: string | null;
}

export interface SessionCredentials {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly session: AuthenticatedSession;
}

export class IdentityService {
  public constructor(
    private readonly repository: IdentityRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: SecureTokenService,
    private readonly mailer: IdentityMailer,
    private readonly policy: IdentityPolicy,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async register(input: {
    readonly email: string;
    readonly displayName: string;
    readonly password: string;
  }): Promise<void> {
    const now = this.now();
    const props = IdentityUser.register({ ...input, now }).toPrimitives();
    const passwordHash = await this.passwordHasher.hash(input.password);
    const verification = this.tokens.issue("email-verification");
    const result = await this.repository.register({
      userId: props.id,
      email: props.email.toString(),
      displayName: props.displayName,
      passwordHash,
      verificationHash: verification.hash,
      verificationExpiresAt: addSeconds(now, this.policy.verificationTtlSeconds)
    });
    if (result.created) {
      await this.mailer.sendEmailVerification({
        email: props.email.toString(),
        displayName: props.displayName,
        token: verification.plaintext
      });
    }
  }

  public async login(input: {
    readonly email: string;
    readonly password: string;
    readonly metadata: SessionMetadata;
  }): Promise<SessionCredentials> {
    const email = EmailAddress.create(input.email).toString();
    const identity = await this.repository.findLoginIdentity(email);
    if (!identity) {
      await this.passwordHasher.verifyDummy(input.password);
      throw authenticationFailed();
    }
    const valid = await this.passwordHasher.verify(identity.passwordHash, input.password);
    if (!valid || identity.status !== "active" || !identity.emailVerified) {
      throw authenticationFailed();
    }
    return this.createSession(identity.userId, input.metadata, null);
  }

  public authenticateSession(sessionToken: string): Promise<AuthenticatedSession | null> {
    return this.repository.authenticateSession({
      tokenHash: this.tokens.hash("session", sessionToken),
      now: this.now(),
      idleTtlSeconds: this.policy.sessionIdleTtlSeconds
    });
  }

  public async issueCsrf(session: AuthenticatedSession): Promise<string> {
    const csrf = this.tokens.issue(`csrf:${session.id}`);
    if (
      !(await this.repository.rotateCsrf({
        userId: session.userId,
        sessionId: session.id,
        csrfHash: csrf.hash
      }))
    ) {
      throw new IdentityError("SESSION_NOT_FOUND", "Session is no longer active.");
    }
    return csrf.plaintext;
  }

  public verifyCsrf(session: AuthenticatedSession, csrfToken: string): boolean {
    return this.tokens.matches(`csrf:${session.id}`, csrfToken, session.csrfHash);
  }

  public logout(sessionToken: string): Promise<void> {
    return this.repository.revokeByTokenHash(
      this.tokens.hash("session", sessionToken),
      this.now()
    );
  }

  public getCurrentUser(userId: string): Promise<SafeIdentityUser | null> {
    return this.repository.getUser(userId);
  }

  public updateProfile(userId: string, displayName: string): Promise<SafeIdentityUser> {
    const now = this.now();
    const normalized = IdentityUser.register({
      id: userId,
      email: "validation@example.invalid",
      displayName,
      now
    }).toPrimitives().displayName;
    return this.repository.updateProfile(userId, normalized, now);
  }

  public async requestEmailChange(input: {
    readonly userId: string;
    readonly email: string;
    readonly currentPassword: string;
    readonly displayName: string;
  }): Promise<void> {
    await this.requireCurrentPassword(input.userId, input.currentPassword);
    const email = EmailAddress.create(input.email).toString();
    const token = this.tokens.issue("email-verification");
    const now = this.now();
    if (
      !(await this.repository.prepareEmailChange({
        userId: input.userId,
        email,
        tokenHash: token.hash,
        expiresAt: addSeconds(now, this.policy.verificationTtlSeconds),
        now
      }))
    ) {
      throw new IdentityError("EMAIL_UNAVAILABLE", "That email address is unavailable.");
    }
    await this.mailer.sendEmailChangeVerification({
      email,
      displayName: input.displayName,
      token: token.plaintext
    });
  }

  public async requestEmailVerification(emailInput: string): Promise<void> {
    const email = EmailAddress.create(emailInput).toString();
    const token = this.tokens.issue("email-verification");
    const now = this.now();
    const recipient = await this.repository.issueEmailVerification({
      email,
      tokenHash: token.hash,
      expiresAt: addSeconds(now, this.policy.verificationTtlSeconds),
      now
    });
    if (recipient)
      await this.mailer.sendEmailVerification({ ...recipient, token: token.plaintext });
  }

  public async confirmEmail(token: string): Promise<void> {
    if (
      !(await this.repository.consumeEmailVerification(
        this.tokens.hash("email-verification", token),
        this.now()
      ))
    )
      throw invalidToken();
  }

  public async requestPasswordReset(emailInput: string): Promise<void> {
    const email = EmailAddress.create(emailInput).toString();
    const token = this.tokens.issue("password-reset");
    const now = this.now();
    const recipient = await this.repository.issuePasswordReset({
      email,
      tokenHash: token.hash,
      expiresAt: addSeconds(now, this.policy.passwordResetTtlSeconds),
      now
    });
    if (recipient)
      await this.mailer.sendPasswordReset({ ...recipient, token: token.plaintext });
  }

  public async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const reset = await this.repository.resetPassword({
      tokenHash: this.tokens.hash("password-reset", token),
      passwordHash: await this.passwordHasher.hash(newPassword),
      now: this.now()
    });
    if (!reset) throw invalidToken();
  }

  public async changePassword(input: {
    readonly userId: string;
    readonly currentSessionId: string;
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly metadata: SessionMetadata;
  }): Promise<SessionCredentials> {
    await this.requireCurrentPassword(input.userId, input.currentPassword);
    await this.repository.changePassword({
      userId: input.userId,
      passwordHash: await this.passwordHasher.hash(input.newPassword),
      now: this.now()
    });
    return this.createSession(input.userId, input.metadata, input.currentSessionId);
  }

  public listSessions(
    userId: string,
    currentSessionId: string
  ): Promise<readonly SessionSummary[]> {
    return this.repository.listSessions(userId, currentSessionId);
  }

  public revokeSession(userId: string, sessionId: string): Promise<boolean> {
    return this.repository.revokeSession(userId, sessionId, this.now());
  }

  public async rotateSession(
    userId: string,
    currentSessionId: string,
    metadata: SessionMetadata
  ): Promise<SessionCredentials> {
    const revoked = await this.repository.revokeSession(
      userId,
      currentSessionId,
      this.now()
    );
    if (!revoked) {
      throw new IdentityError("SESSION_NOT_FOUND", "Session is no longer active.");
    }
    return this.createSession(userId, metadata, currentSessionId);
  }

  private async requireCurrentPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await this.repository.getPasswordHash(userId);
    if (!passwordHash || !(await this.passwordHasher.verify(passwordHash, password))) {
      throw new IdentityError(
        "CURRENT_PASSWORD_INVALID",
        "The current password is incorrect."
      );
    }
  }

  private async createSession(
    userId: string,
    metadata: SessionMetadata,
    rotatedFromId: string | null
  ): Promise<SessionCredentials> {
    const now = this.now();
    const sessionId = randomUUID();
    const sessionToken = this.tokens.issue("session");
    const csrfToken = this.tokens.issue(`csrf:${sessionId}`);
    await this.repository.createSession({
      sessionId,
      userId,
      tokenHash: sessionToken.hash,
      csrfHash: csrfToken.hash,
      userAgent: metadata.userAgent,
      ipHash: metadata.ipHash,
      idleExpiresAt: addSeconds(now, this.policy.sessionIdleTtlSeconds),
      absoluteExpiresAt: addSeconds(now, this.policy.sessionAbsoluteTtlSeconds),
      rotatedFromId,
      now
    });
    const session = await this.repository.authenticateSession({
      tokenHash: sessionToken.hash,
      now,
      idleTtlSeconds: this.policy.sessionIdleTtlSeconds
    });
    if (!session) throw new Error("New session could not be authenticated.");
    return {
      sessionToken: sessionToken.plaintext,
      csrfToken: csrfToken.plaintext,
      session
    };
  }
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function authenticationFailed(): IdentityError {
  return new IdentityError(
    "AUTHENTICATION_FAILED",
    "Email or password is incorrect, or the account is not ready."
  );
}

function invalidToken(): IdentityError {
  return new IdentityError(
    "TOKEN_INVALID_OR_EXPIRED",
    "The token is invalid or has expired."
  );
}
