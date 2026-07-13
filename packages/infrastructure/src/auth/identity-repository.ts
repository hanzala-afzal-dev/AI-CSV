import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  AuthenticatedSession,
  IdentityRepository,
  SafeIdentityUser,
  SessionSummary
} from "@agentic-csv/application";
import { sessions, users, verificationTokens } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

export class PostgresIdentityRepository implements IdentityRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async register(
    input: Parameters<IdentityRepository["register"]>[0]
  ): Promise<{ readonly created: boolean }> {
    const result = await this.database.execute<{ created: boolean }>(sql`
      select public.identity_register(
        ${input.userId}::uuid, ${input.email}, ${input.displayName}, ${input.passwordHash},
        ${input.verificationHash}, ${input.verificationExpiresAt}
      ) as created
    `);
    return { created: result.rows[0]?.created === true };
  }

  public async findLoginIdentity(email: string) {
    const result = await this.database.execute<{
      user_id: string;
      email: string;
      display_name: string;
      password_hash: string;
      status: string;
      email_verified: boolean;
    }>(sql`
      select * from public.identity_find_login(${email})
    `);
    const row = result.rows[0];
    return row
      ? {
          userId: row.user_id,
          email: row.email,
          displayName: row.display_name,
          passwordHash: row.password_hash,
          status: row.status,
          emailVerified: row.email_verified
        }
      : null;
  }

  public async createSession(
    input: Parameters<IdentityRepository["createSession"]>[0]
  ): Promise<void> {
    await this.database.execute(sql`
      select public.identity_create_session(
        ${input.sessionId}::uuid, ${input.userId}::uuid, ${input.tokenHash}, ${input.csrfHash},
        ${input.userAgent}, ${input.ipHash}, ${input.idleExpiresAt}, ${input.absoluteExpiresAt},
        ${input.rotatedFromId}::uuid, ${input.now}
      )
    `);
  }

  public async authenticateSession(
    input: Parameters<IdentityRepository["authenticateSession"]>[0]
  ): Promise<AuthenticatedSession | null> {
    const result = await this.database.execute<SessionRow>(sql`
      select * from public.identity_authenticate_session(
        ${input.tokenHash}, ${input.now}, ${input.idleTtlSeconds}
      )
    `);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  public executeForUser<TResult>(
    userId: string,
    work: (
      transaction: Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0]
    ) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_user_id', ${userId}, true)`
      );
      return work(transaction);
    });
  }

  public async rotateCsrf(
    input: Parameters<IdentityRepository["rotateCsrf"]>[0]
  ): Promise<boolean> {
    return this.executeForUser(input.userId, async (transaction) => {
      const rows = await transaction
        .update(sessions)
        .set({ csrfHash: input.csrfHash })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt)
          )
        )
        .returning({ id: sessions.id });
      return rows.length === 1;
    });
  }

  public async revokeByTokenHash(tokenHash: string, now: Date): Promise<void> {
    await this.database.execute(
      sql`select public.identity_revoke_session(${tokenHash}, ${now})`
    );
  }

  public getUser(userId: string): Promise<SafeIdentityUser | null> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0] ? mapUser(rows[0]) : null;
    });
  }

  public getPasswordHash(userId: string): Promise<string | null> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0]?.passwordHash ?? null;
    });
  }

  public updateProfile(
    userId: string,
    displayName: string,
    now: Date
  ): Promise<SafeIdentityUser> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .update(users)
        .set({ displayName, updatedAt: now })
        .where(eq(users.id, userId))
        .returning();
      if (!rows[0]) throw new Error("Identity user was not found.");
      return mapUser(rows[0]);
    });
  }

  public prepareEmailChange(
    input: Parameters<IdentityRepository["prepareEmailChange"]>[0]
  ): Promise<boolean> {
    return this.executeForUser(input.userId, async (transaction) => {
      const unavailable = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (unavailable.length > 0) return false;
      await transaction
        .update(users)
        .set({ pendingEmail: input.email, updatedAt: input.now })
        .where(eq(users.id, input.userId));
      await transaction
        .update(verificationTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(verificationTokens.userId, input.userId),
            eq(verificationTokens.purpose, "email_change"),
            isNull(verificationTokens.consumedAt)
          )
        );
      await transaction.insert(verificationTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose: "email_change",
        pendingEmail: input.email,
        expiresAt: input.expiresAt
      });
      return true;
    });
  }

  public async issueEmailVerification(
    input: Parameters<IdentityRepository["issueEmailVerification"]>[0]
  ) {
    const result = await this.database.execute<{ email: string; display_name: string }>(
      sql`select * from public.identity_issue_verification(${input.email}, ${input.tokenHash}, ${input.expiresAt}, ${input.now})`
    );
    const row = result.rows[0];
    return row ? { email: row.email, displayName: row.display_name } : null;
  }

  public async consumeEmailVerification(tokenHash: string, now: Date): Promise<boolean> {
    const result = await this.database.execute<{ consumed: boolean }>(
      sql`select public.identity_consume_verification(${tokenHash}, ${now}) as consumed`
    );
    return result.rows[0]?.consumed === true;
  }

  public async issuePasswordReset(
    input: Parameters<IdentityRepository["issuePasswordReset"]>[0]
  ) {
    const result = await this.database.execute<{ email: string; display_name: string }>(
      sql`select * from public.identity_issue_password_reset(${input.email}, ${input.tokenHash}, ${input.expiresAt}, ${input.now})`
    );
    const row = result.rows[0];
    return row ? { email: row.email, displayName: row.display_name } : null;
  }

  public async resetPassword(
    input: Parameters<IdentityRepository["resetPassword"]>[0]
  ): Promise<boolean> {
    const result = await this.database.execute<{ reset: boolean }>(
      sql`select public.identity_reset_password(${input.tokenHash}, ${input.passwordHash}, ${input.now}) as reset`
    );
    return result.rows[0]?.reset === true;
  }

  public changePassword(
    input: Parameters<IdentityRepository["changePassword"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      await transaction
        .update(users)
        .set({ passwordHash: input.passwordHash, updatedAt: input.now })
        .where(eq(users.id, input.userId));
      await transaction
        .update(sessions)
        .set({ revokedAt: input.now })
        .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));
    });
  }

  public listSessions(
    userId: string,
    currentSessionId: string
  ): Promise<readonly SessionSummary[]> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .select({
          id: sessions.id,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          lastSeenAt: sessions.lastSeenAt,
          absoluteExpiresAt: sessions.absoluteExpiresAt
        })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
        .orderBy(desc(sessions.lastSeenAt));
      return rows.map((row) => ({
        id: row.id,
        current: row.id === currentSessionId,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        absoluteExpiresAt: row.absoluteExpiresAt
      }));
    });
  }

  public revokeSession(userId: string, sessionId: string, now: Date): Promise<boolean> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessions.id, sessionId),
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt)
          )
        )
        .returning({ id: sessions.id });
      return rows.length === 1;
    });
  }
}

interface SessionRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  csrf_hash: string;
  created_at: Date | string;
  last_seen_at: Date | string;
  idle_expires_at: Date | string;
  absolute_expires_at: Date | string;
  email: string;
  pending_email: string | null;
  display_name: string;
  email_verified: boolean;
}

function mapSession(row: SessionRow): AuthenticatedSession {
  return {
    id: row.id,
    userId: row.user_id,
    csrfHash: row.csrf_hash,
    createdAt: databaseDate(row.created_at, "created_at"),
    lastSeenAt: databaseDate(row.last_seen_at, "last_seen_at"),
    idleExpiresAt: databaseDate(row.idle_expires_at, "idle_expires_at"),
    absoluteExpiresAt: databaseDate(row.absolute_expires_at, "absolute_expires_at"),
    user: {
      id: row.user_id,
      email: row.email,
      pendingEmail: row.pending_email,
      displayName: row.display_name,
      emailVerified: row.email_verified
    }
  };
}

function databaseDate(value: Date | string, column: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Identity session contains an invalid ${column} timestamp.`);
  }
  return date;
}

function mapUser(row: typeof users.$inferSelect): SafeIdentityUser {
  if (!row.email) throw new Error("Browser identity is missing an email address.");
  return {
    id: row.id,
    email: row.email,
    pendingEmail: row.pendingEmail,
    displayName: row.displayName,
    emailVerified: row.emailVerifiedAt !== null
  };
}
