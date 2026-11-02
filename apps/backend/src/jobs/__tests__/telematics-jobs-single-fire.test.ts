import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leaseSecondsFor } from "../geofence-state-watcher.js";

// TELEMATICS-DEADLOCK-03 (Render 2026-11-02 40P01 in geofence_state_watcher, samsara positions, auto-status-switch):
// these three 5-minute jobs ran on BOTH API instances at once against the same units. Each must be single-fire,
// with a lease that expires before its next tick.
describe("telematics jobs are single-fire across API instances", () => {
  it("geofence watcher lease is always shorter than its interval", () => {
    expect(leaseSecondsFor(5 * 60_000)).toBe(270);
    expect(leaseSecondsFor(60_000)).toBe(30);
    for (const ms of [60_000, 120_000, 300_000, 900_000]) expect(leaseSecondsFor(ms)).toBeLessThan(ms / 1000);
  });

  for (const [file, needle] of [
    ["../geofence-state-watcher.ts", "leaseSeconds: leaseSecondsFor(ms)"],
    ["../auto-status-switch-worker.ts", "{ leaseSeconds: 270 }"],
    ["../../cron/samsara-positions-cron.ts", "{ leaseSeconds: 270 }"],
  ] as const) {
    it(`${file} passes a single-fire lease to wrapBackgroundJobTick`, () => {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).toContain(needle);
    });
  }
});
