import { describe, expect, it } from "vitest";
import { pollIntervalSeconds } from "../src/smartthings/budget.js";

describe("pollIntervalSeconds", () => {
  it("keeps a 100k/month plan under budget with one device", () => {
    const s = pollIntervalSeconds({
      monthlyBudget: 100_000,
      usedThisMonth: 0,
      now: new Date("2026-12-01T00:00:00Z"),
      callsPerPoll: 1,
    });
    // 31 days / 80k polls ≈ 33.5s, clamped to the 60s minimum
    expect(s).toBe(60);
  });

  it("slows down when most of the budget is used", () => {
    const s = pollIntervalSeconds({
      monthlyBudget: 100_000,
      usedThisMonth: 79_000,
      now: new Date("2026-12-16T00:00:00Z"),
      callsPerPoll: 1,
    });
    expect(s).toBeGreaterThan(1000);
  });

  it("stops when the poll budget is exhausted", () => {
    const s = pollIntervalSeconds({
      monthlyBudget: 100_000,
      usedThisMonth: 90_000,
      now: new Date("2026-12-20T00:00:00Z"),
      callsPerPoll: 1,
    });
    expect(s).toBe(Number.POSITIVE_INFINITY);
  });
});
