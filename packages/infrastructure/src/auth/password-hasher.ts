import argon2 from "argon2";
import type { PasswordHasher } from "@agentic-csv/application";

const dummyPasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$W8PnNGUGpJc1hvQzLuOONQ$CEYsOhNBopOCndEEXxYW8wlUpqbqzcJzXtKP/8GLSiY";

export interface Argon2Policy {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

export class Argon2PasswordHasher implements PasswordHasher {
  public constructor(private readonly policy: Argon2Policy) {}

  public hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.policy.memoryCost,
      timeCost: this.policy.timeCost,
      parallelism: this.policy.parallelism
    });
  }

  public async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  public async verifyDummy(password: string): Promise<void> {
    await argon2.verify(dummyPasswordHash, password);
  }
}
