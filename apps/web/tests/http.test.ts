import { describe, expect, it } from "vitest";
import { HttpError, validateMutationRequest } from "../src/server/http";

const trustedOrigin = "https://csv.example.com";

describe("mutation request security", () => {
  it("accepts same-origin JSON requests", () => {
    const request = new Request(`${trustedOrigin}/api/v1/datasets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: trustedOrigin,
        "sec-fetch-site": "same-origin"
      }
    });

    expect(() => validateMutationRequest(request, trustedOrigin)).not.toThrow();
  });

  it("rejects cross-site mutations", () => {
    const request = new Request(`${trustedOrigin}/api/v1/datasets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site"
      }
    });

    expect(() => validateMutationRequest(request, trustedOrigin)).toThrowError(HttpError);
  });

  it("rejects form content types", () => {
    const request = new Request(`${trustedOrigin}/api/v1/datasets`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });

    expect(() => validateMutationRequest(request, trustedOrigin)).toThrowError(
      "Content-Type must be application/json"
    );
  });
});
