import { describe, expect, it } from "vitest";
import { ProviderModelId, ProviderPreference } from "../src";

describe("provider preferences", () => {
  it("accepts an accessible model and one of its supported reasoning values", () => {
    const preference = ProviderPreference.create({
      modelId: "gpt-5.5",
      reasoningEffort: "medium",
      allowedReasoningEfforts: ["low", "medium", "high"]
    });

    expect(preference.modelId.toString()).toBe("gpt-5.5");
    expect(preference.reasoningEffort).toBe("medium");
  });

  it("rejects unsafe model identifiers and unsupported reasoning values", () => {
    expect(() => ProviderModelId.create("../../secret")).toThrow(
      "Provider model identifier is invalid"
    );
    expect(() =>
      ProviderPreference.create({
        modelId: "gpt-5.5-pro",
        reasoningEffort: "low",
        allowedReasoningEfforts: ["medium", "high", "xhigh"]
      })
    ).toThrow("Reasoning effort is not supported");
  });
});
