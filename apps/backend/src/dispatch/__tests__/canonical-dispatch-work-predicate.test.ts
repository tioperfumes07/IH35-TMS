import { describe, expect, it } from "vitest";
import {
  CANONICAL_ACTIVE_LOAD_STATUSES,
  DISPATCH_WORK_LOAD_STATUSES,
  canonicalDispatchWorkStatusClause,
  canonicalDispatchWorkWhereClause,
} from "../canonical-active-load-set.js";

/**
 * TRUCKLINE-16 (Lead, 2026-09-30) — the dispatch-work predicate is a SEPARATE, permanent question
 * from the accounting one ("is a unit carrying this load right now" vs. "is this load open on the
 * books"). These tests pin the two properties the owner's own ruling depends on: no money test,
 * and completed_docs_received excluded (paperwork-done means the truck is no longer carrying it).
 */
describe("canonical dispatch-work predicate", () => {
  it("is a strict subset of CANONICAL_ACTIVE_LOAD_STATUSES", () => {
    const allowed = new Set<string>(CANONICAL_ACTIVE_LOAD_STATUSES);
    for (const status of DISPATCH_WORK_LOAD_STATUSES) {
      expect(allowed.has(status)).toBe(true);
    }
  });

  it("excludes completed_docs_received and everything at-or-past delivery", () => {
    const excluded = ["completed_docs_received", "delivered", "delivered_pending_docs", "abandoned", "driver_walkoff", "driver_no_show"];
    for (const status of excluded) {
      expect((DISPATCH_WORK_LOAD_STATUSES as readonly string[]).includes(status)).toBe(false);
    }
  });

  it("includes the pre-dispatch statuses (booked/planned/assigned/unassigned) that the old private lists dropped", () => {
    for (const status of ["booked", "planned", "assigned", "unassigned", "assigned_not_dispatched"]) {
      expect((DISPATCH_WORK_LOAD_STATUSES as readonly string[]).includes(status)).toBe(true);
    }
  });

  it("canonicalDispatchWorkStatusClause renders an aliased IN(...) fragment", () => {
    const clause = canonicalDispatchWorkStatusClause("x");
    expect(clause).toMatch(/^x\.status IN \(/);
    expect(clause).not.toMatch(/completed_docs_received/);
  });

  it("canonicalDispatchWorkWhereClause bakes in the entity gate and no money test", () => {
    const clause = canonicalDispatchWorkWhereClause("l", "$1::uuid");
    expect(clause).toMatch(/l\.status IN \(/);
    expect(clause).toMatch(/l\.operating_company_id = \$1::uuid/);
    // No money-half functions/tables anywhere in this predicate.
    expect(clause).not.toMatch(/settlement_lines|driver_bills|accounting\.invoices/);
  });
});
