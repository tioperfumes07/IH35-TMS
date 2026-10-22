// LEAD 443.219 G-VOCAB — fails on origin/main (no vocabulary module, no driver-bill status filter): the A/P "Unpaid" filter is
// every bill that still owes money, a driver bill's "Unpaid" is open / approved / disputed, and the missing-driver-bill
// predicate never lists a voided / exit load nor counts a VOID bill as a bill.
import { describe, expect, it } from "vitest";

describe("443.219 — one status vocabulary per document type", () => {
  it("A/P outstanding includes partially paid; driver outstanding includes approved and disputed", async () => {
    const v = await import("../../lib/document-status-vocabulary.js");
    expect(v.AP_BILL_OUTSTANDING_STATUSES).toEqual(expect.arrayContaining(["unpaid", "partially_paid"]));
    expect(v.DRIVER_BILL_OUTSTANDING_STATUSES).toEqual(["open", "approved", "disputed", "awaiting_short_miles"]);
  });
  it("the register's driver-bill status filter speaks the driver-bill vocabulary", async () => {
    const r = (await import("../bills.routes.js")) as Record<string, unknown>;
    const f = r.driverBillStatusesForFilter as (s?: string) => string[] | null;
    expect(f("unpaid")).toEqual(["open", "approved", "disputed", "awaiting_short_miles"]);
    expect(f("voided")).toEqual(["void"]);
    expect(f("all")).toBeNull();
  });
  it("missing driver bill: no voided / exit / draft load, and a void bill is not a bill", async () => {
    const v = await import("../../lib/document-status-vocabulary.js");
    const sql = v.loadMissingDriverBillWhereSql("l");
    for (const s of ["voided", "abandoned", "driver_walkoff", "driver_no_show", "cancelled", "draft"]) expect(sql).toContain(`'${s}'`);
    expect(sql).toContain("l.voided_at IS NULL");
    expect(sql).toContain("mdb.voided_at IS NULL AND mdb.status <> 'void'");
  });
});
