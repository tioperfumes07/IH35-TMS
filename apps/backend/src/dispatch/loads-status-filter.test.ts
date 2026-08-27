import { describe, expect, it } from "vitest";
import { normalizeDispatchStatusFilterValue } from "./loads.routes.js";
import { dispatchStatusSchema } from "./load-state-machine.js";

// DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400: GET /api/v1/dispatch/loads validates ?status= against
// the NARROW dispatchStatusSchema (10 values), but a caller with the WIDE mdata.load_status_enum vocabulary
// (19 values — a load's own `.status` field, or an old saved/bookmarked filter) 400'd with no translation.
// normalizeDispatchStatusFilterValue() must map every wide value to a narrow one the schema accepts.

// The full mdata.load_status_enum / frontend LoadStatus union — kept independent of the source file's own
// WIDE_LOAD_STATUS_VALUES set so this test can't pass by tautology if that set is ever narrowed by mistake.
const ALL_WIDE_MDATA_STATUSES = [
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
] as const;

describe("normalizeDispatchStatusFilterValue — DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400", () => {
  it.each(ALL_WIDE_MDATA_STATUSES)("every wide mdata status value (%s) normalizes to something dispatchStatusSchema accepts", (wide) => {
    const normalized = normalizeDispatchStatusFilterValue(wide);
    const parsed = dispatchStatusSchema.safeParse(normalized);
    expect(parsed.success, `"${wide}" normalized to "${normalized}", which dispatchStatusSchema rejects`).toBe(true);
  });

  it("already-narrow values round-trip unchanged", () => {
    for (const narrow of dispatchStatusSchema.options) {
      expect(normalizeDispatchStatusFilterValue(narrow)).toBe(narrow);
    }
  });

  it("genuine garbage passes through unchanged (so it still fails validation normally, never silently swallowed)", () => {
    expect(normalizeDispatchStatusFilterValue("not_a_real_status")).toBe("not_a_real_status");
    expect(dispatchStatusSchema.safeParse(normalizeDispatchStatusFilterValue("not_a_real_status")).success).toBe(false);
  });

  it("the exact repro from the live finding: status=delivered no longer 400s", () => {
    const normalized = normalizeDispatchStatusFilterValue("delivered");
    expect(dispatchStatusSchema.safeParse(normalized).success).toBe(true);
    expect(normalized).toBe("delivered_pending_docs");
  });
});
