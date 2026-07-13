import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SecureTokenService } from "@agentic-csv/application";

export class HmacSecureTokenService implements SecureTokenService {
  public constructor(private readonly secret: string) {}

  public issue(scope: string): { readonly plaintext: string; readonly hash: string } {
    const plaintext = randomBytes(32).toString("base64url");
    return { plaintext, hash: this.hash(scope, plaintext) };
  }

  public hash(scope: string, plaintext: string): string {
    return createHmac("sha256", this.secret)
      .update(`${scope}\0${plaintext}`)
      .digest("hex");
  }

  public matches(scope: string, plaintext: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(scope, plaintext), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
