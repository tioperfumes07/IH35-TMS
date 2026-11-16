/**
 * ROUND 12 — the engine board tells "ran green, nothing new" (idle) from "did not run / failed" (red). Measured 11-16:
 * E-07 / E-12 / E-21 ran green daily (_system.background_jobs) yet showed RED because their output had no new row.
 */
import { describe, expect, it } from "vitest";
import { healthFor } from "../engine-status.reads.js";
import { ENGINE_STATUS_CATALOG } from "../engine-status.catalog.js";

const e12 = ENGINE_STATUS_CATALOG.find((e) => e.id === "E-12")!;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

describe("engine board health", () => {
  it("ran green inside its window, nothing new → idle with the run time (never ok)", () => {
    const r = healthFor(e12, { lastRunAt: hoursAgo(3), lastSuccess: true, lastError: null, rows24h: 0, probeNote: null });
    expect(r.health).toBe("idle");
    expect(r.reason).toMatch(/nothing new/);
  });
  it("last run outside the window → red", () => {
    expect(healthFor(e12, { lastRunAt: hoursAgo(40), lastSuccess: true, lastError: null, rows24h: 0, probeNote: null }).health).toBe("red");
  });
  it("last run failed → red with its error", () => {
    const r = healthFor(e12, { lastRunAt: hoursAgo(1), lastSuccess: false, lastError: "boom", rows24h: 0, probeNote: null });
    expect(r).toEqual({ health: "red", reason: "boom" });
  });
  it("never ran → red", () => {
    expect(healthFor(e12, { lastRunAt: null, lastSuccess: null, lastError: null, rows24h: 0, probeNote: null }).health).toBe("red");
  });
  it("the daily engines name their job", () => {
    for (const id of ["E-05", "E-07", "E-12", "E-19", "E-21", "E-22"]) expect(ENGINE_STATUS_CATALOG.find((e) => e.id === id)?.jobNames?.length).toBeGreaterThan(0);
  });
});
