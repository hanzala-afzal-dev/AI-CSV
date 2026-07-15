import { describe, expect, it, vi } from "vitest";
import { SecretValue } from "@agentic-csv/application";
import { OpenAiProviderGateway } from "../src/providers";

const apiKey = "sk-test-abcdefghijklmnopqrstuvwxyz123456";

describe("OpenAiProviderGateway", () => {
  it("uses the model-list endpoint and returns only compatible safe metadata", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
        expect(init?.redirect).toBe("error");
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.5", owned_by: "openai" },
              { id: "gpt-5.5-pro" },
              { id: "text-embedding-3-small" },
              { id: "gpt-realtime" }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    ) as typeof fetch;
    const gateway = new OpenAiProviderGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 1000,
      fetch: fetchMock
    });
    const secret = SecretValue.create(apiKey);

    const result = await gateway.validateCredential(secret);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.openai.test/v1/models"),
      expect.any(Object)
    );
    expect(result.models.map((model) => model.id)).toEqual(["gpt-5.5-pro", "gpt-5.5"]);
    expect(result.models[0]?.reasoningEfforts).toEqual(["medium", "high", "xhigh"]);
    expect(JSON.stringify(result)).not.toContain("owned_by");
    secret.destroy();
  });

  it.each([
    [401, "PROVIDER_KEY_INVALID"],
    [403, "PROVIDER_KEY_INVALID"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"]
  ])("maps provider status %s to a stable safe code", async (status, code) => {
    const gateway = new OpenAiProviderGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 1000,
      fetch: vi.fn(
        async () =>
          new Response('{"error":{"message":"secret-bearing raw response"}}', {
            status
          })
      ) as typeof fetch
    });
    const secret = SecretValue.create(apiKey);

    await expect(gateway.validateCredential(secret)).rejects.toMatchObject({ code });
    await expect(gateway.validateCredential(secret)).rejects.not.toThrow(
      "secret-bearing raw response"
    );
    secret.destroy();
  });
});
