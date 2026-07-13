import { describe, expect, it, vi } from "vitest";
import { PostgresIdentityRepository } from "../src/auth/identity-repository";
import type { DatabaseClient } from "../src/database/client";

describe("PostgresIdentityRepository", () => {
  it("maps raw PostgreSQL session timestamps to Date objects", async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "22222222-2222-4222-8222-222222222222",
          csrf_hash: "csrf-hash",
          created_at: "2026-07-13T09:12:12.000Z",
          last_seen_at: "2026-07-13T09:13:12.000Z",
          idle_expires_at: "2026-07-13T09:43:12.000Z",
          absolute_expires_at: "2026-07-14T09:12:12.000Z",
          email: "person@example.com",
          pending_email: null,
          display_name: "Test Person",
          email_verified: true
        }
      ]
    }));
    const repository = new PostgresIdentityRepository({
      execute
    } as unknown as DatabaseClient);

    const session = await repository.authenticateSession({
      tokenHash: "token-hash",
      now: new Date("2026-07-13T09:13:12.000Z"),
      idleTtlSeconds: 1_800
    });

    expect(session?.createdAt).toEqual(new Date("2026-07-13T09:12:12.000Z"));
    expect(session?.lastSeenAt).toBeInstanceOf(Date);
    expect(session?.idleExpiresAt).toBeInstanceOf(Date);
    expect(session?.absoluteExpiresAt).toBeInstanceOf(Date);
  });
});
