import { describe, expect, it } from "vitest";
import { redactionPaths } from "../src";

describe("logger redaction", () => {
  it("covers root and nested credential fields", () => {
    expect(redactionPaths).toEqual(
      expect.arrayContaining([
        "authorization",
        "headers.authorization",
        "req.headers.authorization",
        "apiKey",
        "uploadUrl",
        "*.password"
      ])
    );
  });
});
