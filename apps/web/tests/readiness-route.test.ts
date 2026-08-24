import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getRuntimeReadinessReport: vi.fn()
}));

vi.mock("../src/server/runtime", () => ({
  getRuntimeReadinessReport: state.getRuntimeReadinessReport
}));

import { GET } from "../src/app/api/ready/route";

describe("readiness route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T10:00:00.000Z"));
    state.getRuntimeReadinessReport.mockReset().mockResolvedValue({
      ok: true,
      checkedAt: "2026-08-24T10:00:00.000Z",
      dependencies: []
    });
  });

  it("coalesces concurrent requests and caches the shared-runtime report briefly", async () => {
    const [first, second] = await Promise.all([GET(), GET()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.getRuntimeReadinessReport).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_001);
    await GET();
    expect(state.getRuntimeReadinessReport).toHaveBeenCalledTimes(2);
  });
});
