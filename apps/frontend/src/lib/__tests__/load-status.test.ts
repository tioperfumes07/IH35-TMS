import { describe, expect, it } from "vitest";

/**
 * LEAD 443.206R (register C5 / B9 / B11) — one load-status label, one draft definition, shared status sets.
 * Fails on origin/main: lib/load-status.ts does not exist; STATUS_LABEL (components/dispatch/constants.ts) had no 'voided' key,
 * so a voided load rendered "undefined".
 */
const mod = (await import("../load-status").catch(() => ({}))) as Record<string, unknown>;

const ENUM = ["draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit",
  "at_delivery", "delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed", "cancelled", "abandoned",
  "driver_walkoff", "driver_no_show", "voided"];

describe("443.206R — one load status label", () => {
  it("labels every mdata.load_status_enum value, 'voided' included — never undefined", () => {
    const label = mod.loadStatusLabel as ((s: string) => string) | undefined;
    expect(typeof label).toBe("function");
    expect(label!("voided")).toBe("Voided");
    for (const s of ENUM) {
      expect(typeof label!(s)).toBe("string");
      expect(label!(s)).not.toMatch(/_/);
    }
  });

  it("one draft definition: status 'draft' OR a quick-save draft", () => {
    const isDraft = mod.isDraftLoad as ((l: { status?: string; is_quicksave_draft?: boolean }) => boolean) | undefined;
    expect(typeof isDraft).toBe("function");
    expect(isDraft!({ status: "draft" })).toBe(true);
    expect(isDraft!({ status: "assigned_not_dispatched", is_quicksave_draft: true })).toBe(true);
    expect(isDraft!({ status: "dispatched" })).toBe(false);
  });

  it("the board's live set is the backend dispatch-work set, and the groups cover every status exactly once", () => {
    expect(mod.DISPATCH_WORK_STATUSES).toEqual(["booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit", "at_delivery"]);
    const groups = mod.LOAD_STATUS_GROUPS as Array<{ statuses: string[] }>;
    const covered = groups.flatMap((g) => g.statuses).sort();
    expect(covered).toEqual([...ENUM].sort());
  });
});
