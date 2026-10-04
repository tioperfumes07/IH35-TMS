import { describe, expect, it } from "vitest";
import type { DriverBillListRow, VendorBill } from "../../api/accounting";
import {
  BILL_STATUS_FILTER_VALUES,
  driverBillMatchesStatusFilter,
  statusFilterNeedsServerNarrowing,
  vendorBillMatchesStatusFilter,
} from "./billStatusFilter";

function vendorBill(status: VendorBill["status"]): VendorBill {
  return {
    id: `bill-${status}`,
    operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    vendor_id: null,
    vendor_uuid: null,
    mdata_vendor_id: null,
    bill_number: "13535",
    bill_date: "2026-09-25",
    due_date: "2026-09-25",
    amount_cents: 94510,
    paid_cents: 0,
    status,
    memo: "Load 13535 — Settlement 5783",
    created_at: "2026-09-25T00:00:00.000Z",
    updated_at: "2026-09-25T00:00:00.000Z",
    revoked_at: null,
  } as VendorBill;
}

function driverBill(status: string, voidedAt: string | null = null): DriverBillListRow {
  return {
    id: `db-${status}`,
    bill_number: "DB-1",
    driver_id: "d1",
    driver_name: "Driver One",
    load_id: null,
    load_number: null,
    miles_basis: null,
    rate_per_mile_cents: null,
    miles_deadhead: null,
    rate_empty_per_mile_cents: null,
    gross_amount_cents: 94510,
    status,
    settled_in_settlement_id: null,
    settlement_display_id: null,
    voided_at: voidedAt,
    created_at: "2026-09-25T00:00:00.000Z",
  };
}

const LIVE_VENDOR_STATUSES: VendorBill["status"][] = ["open", "partial", "paid", "voided"];

describe("BILLS-STATUS-VOCAB-01 — the default view must never empty a populated register", () => {
  // The live defect, pinned: USMCA had 93 vendor + 136 driver bills and both tables rendered
  // "No bills found." because the default selection is the server pseudo-status "active".
  it("keeps every non-voided vendor bill under the default ['active'] selection", () => {
    for (const status of LIVE_VENDOR_STATUSES) {
      const kept = vendorBillMatchesStatusFilter(vendorBill(status), ["active"], true);
      expect(kept, `vendor status=${status}`).toBe(true);
    }
  });

  it("keeps every live driver bill under the default ['active'] selection", () => {
    for (const status of ["open", "paid"]) {
      expect(driverBillMatchesStatusFilter(driverBill(status), ["active"], true), status).toBe(true);
    }
  });

  // Rule 3 generalised: no selectable value may blank a populated list on its own.
  it("no single selectable status value drops every row of both tables", () => {
    for (const value of BILL_STATUS_FILTER_VALUES) {
      const anyVendor = LIVE_VENDOR_STATUSES.some((s) => vendorBillMatchesStatusFilter(vendorBill(s), [value], true));
      expect(anyVendor, `vendor value=${value}`).toBe(true);
      const anyDriver = ["open", "paid"].some((s) => driverBillMatchesStatusFilter(driverBill(s), [value], true));
      expect(anyDriver, `driver value=${value}`).toBe(true);
    }
  });
});

describe("the server's narrowing is never re-applied, and the client's is exact", () => {
  it("passes everything through when the server already narrowed (single selection)", () => {
    expect(vendorBillMatchesStatusFilter(vendorBill("voided"), ["paid"], true)).toBe(true);
  });

  it("ORs the selected statuses when the server did not narrow (2+ selected)", () => {
    const selection = ["paid", "voided"];
    expect(vendorBillMatchesStatusFilter(vendorBill("paid"), selection, false)).toBe(true);
    expect(vendorBillMatchesStatusFilter(vendorBill("voided"), selection, false)).toBe(true);
    expect(vendorBillMatchesStatusFilter(vendorBill("open"), selection, false)).toBe(false);
    expect(vendorBillMatchesStatusFilter(vendorBill("partial"), selection, false)).toBe(false);
  });

  it("maps unpaid to the canonical 'open' the register converts it to", () => {
    expect(vendorBillMatchesStatusFilter(vendorBill("open"), ["unpaid", "voided"], false)).toBe(true);
    expect(vendorBillMatchesStatusFilter(vendorBill("paid"), ["unpaid", "voided"], false)).toBe(false);
  });

  it("treats a driver bill with voided_at as voided whatever its status string says", () => {
    const b = driverBill("open", "2026-09-30T00:00:00.000Z");
    expect(driverBillMatchesStatusFilter(b, ["voided", "paid"], false)).toBe(true);
    expect(driverBillMatchesStatusFilter(b, ["active", "paid"], false)).toBe(false);
  });

  it("declines to narrow — and reports it — when an inexpressible value is combined", () => {
    const selection = ["posted", "paid"];
    expect(statusFilterNeedsServerNarrowing(selection)).toBe(true);
    expect(vendorBillMatchesStatusFilter(vendorBill("open"), selection, false)).toBe(true);
    expect(statusFilterNeedsServerNarrowing(["posted"])).toBe(false);
    expect(statusFilterNeedsServerNarrowing(["paid", "voided"])).toBe(false);
  });

  it("never narrows on an unrecognised value", () => {
    expect(vendorBillMatchesStatusFilter(vendorBill("open"), ["not_a_status"], false)).toBe(true);
  });
});
