import { describe, expect, test } from "vitest";
import { ACTIVE_DISPATCH_STATUSES, PENDING_LOAD_STATUSES } from "../truck-line.routes.js";
import { DISPATCH_WORK_LOAD_STATUSES } from "../../canonical-active-load-set.js";

// T-04 (Lead order, 2026-09-30): the bottom-section feed's status set must be exactly
// DISPATCH_WORK_LOAD_STATUSES minus the actively-rolling trailing four, derived rather than
// hand-duplicated, so it can never silently drift from the canonical list a status gets added to.
describe("PENDING_LOAD_STATUSES", () => {
  test("is a strict subset of DISPATCH_WORK_LOAD_STATUSES", () => {
    for (const status of PENDING_LOAD_STATUSES) {
      expect(DISPATCH_WORK_LOAD_STATUSES).toContain(status);
    }
  });

  test("excludes every actively-dispatched status", () => {
    for (const status of ACTIVE_DISPATCH_STATUSES) {
      expect(PENDING_LOAD_STATUSES).not.toContain(status);
    }
  });

  test("union of pending + active reconstructs the full dispatch-work set", () => {
    const union = new Set([...PENDING_LOAD_STATUSES, ...ACTIVE_DISPATCH_STATUSES]);
    expect(union.size).toBe(DISPATCH_WORK_LOAD_STATUSES.length);
    for (const status of DISPATCH_WORK_LOAD_STATUSES) {
      expect(union.has(status)).toBe(true);
    }
  });

  test("matches the exact expected pre-dispatch vocabulary", () => {
    expect([...PENDING_LOAD_STATUSES].sort()).toEqual(
      ["assigned", "assigned_not_dispatched", "booked", "planned", "unassigned"].sort()
    );
  });
});
