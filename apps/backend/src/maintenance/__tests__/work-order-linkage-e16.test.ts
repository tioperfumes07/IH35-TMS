import { describe, expect, it } from "vitest";
import { loadWorkOrderLinkage, workOrderDateOrderError } from "../work-orders.routes.js";

const OPCO = "00000000-0000-4000-8000-0000000000aa";
const WO = "00000000-0000-4000-8000-0000000000w1";

describe("E-16 work-order linkage resolves every hub", () => {
  it("unit, driver at the time, vendor, bill, expense and their journal entries", async () => {
    const seen: string[] = [];
    const client = {
      query: async <T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
        seen.push(sql);
        const rows = (x: unknown[]) => ({ rows: x as T[] });
        if (sql.includes("FROM maintenance.work_orders w")) {
          expect(sql).toContain("telematics.vehicle_driver_assignments");
          expect(values).toEqual([OPCO, WO]);
          return rows([{ unit_id: "u1", unit_number: "T174", driver_at_time_id: "d1", driver_at_time_name: "Juan Perez", vendor_id: "v1", vendor_name: "Laredo Truck Repair", at: "2026-09-30 12:00:00+00",
            equipment_id: "t1", equipment_number: "TR-53", customer_id: "c1", customer_name: "Acme Foods", load_id: "l1", load_number: "L-100",
            roadside_load_id: null, roadside_load_number: null, roadside_vendor_id: null, roadside_vendor_name: null,
            source_intransit_issue_id: null, insurance_claim_id: null, vendor_invoice_doc_id: "f1", vendor_invoice_doc_name: "inv.pdf",
            repair_location: "vendor", service_location_type: "shop", shop_name: "Laredo Truck Repair", shop_address: "Laredo TX", roadside_location: null }]);
        }
        if (sql.includes("FROM accounting.bills")) return rows([{ id: "b1", display_id: "BILL-1", bill_number: "INV-9", amount_cents: "125000", status: "posted", voided_at: null }]);
        if (sql.includes("FROM accounting.expenses")) return rows([{ id: "e1", total_amount_cents: "4000", status: "posted", journal_entry_id: "j2", voided_at: null }]);
        if (sql.includes("FROM accounting.bill_payments")) return rows([{ id: "bp1", bill_id: "b1", payment_date: "2026-10-05", amount_cents: "125000", payment_method: "ach", reference_number: "R1", voided_at: null }]);
        if (sql.includes("FROM accounting.invoices")) { expect(values?.[1]).toEqual(["l1"]); return rows([{ id: "i1", display_id: "INV-1", source_load_id: "l1", customer_id: "c1", total_cents: "300000", status: "sent", voided_at: null }]); }
        if (sql.includes("FROM accounting.payment_applications")) return rows([{ payment_id: "p1", display_id: "PMT-1", invoice_id: "i1", applied_cents: "300000", payment_date: "2026-10-20", payment_method: "ach", voided_at: null }]);
        if (sql.includes("FROM accounting.journal_entry_postings")) {
          expect(values?.[1]).toEqual(["b1", "e1"]);
          return rows([{ journal_entry_id: "j1", source_transaction_type: "bill", source_transaction_id: "b1" }, { journal_entry_id: "j2", source_transaction_type: "expense", source_transaction_id: "e1" }]);
        }
        return rows([]);
      },
    };
    const link = await loadWorkOrderLinkage(client, OPCO, WO);
    expect(link.unit).toEqual({ id: "u1", unit_number: "T174" });
    expect(link.driver_at_time).toMatchObject({ id: "d1", name: "Juan Perez" });
    expect(link.vendor).toEqual({ id: "v1", name: "Laredo Truck Repair" });
    expect(link.bills.map((b) => b.id)).toEqual(["b1"]);
    expect(link.expenses.map((e) => e.id)).toEqual(["e1"]);
    expect(link.journal_entries.map((j) => j.journal_entry_id)).toEqual(["j1", "j2"]);
    expect(link.trailer).toEqual({ id: "t1", equipment_number: "TR-53" });
    expect(link.customer).toEqual({ id: "c1", name: "Acme Foods" });
    expect(link.loads).toEqual([{ id: "l1", load_number: "L-100", role: "trip" }]);
    expect(link.bill_payments.map((p) => p.id)).toEqual(["bp1"]);
    expect(link.load_invoices.map((i) => i.id)).toEqual(["i1"]);
    expect(link.received_payments.map((p) => p.payment_id)).toEqual(["p1"]);
    expect(link.vendor_invoice_document).toEqual({ id: "f1", name: "inv.pdf" });
    expect(link.location).toMatchObject({ service_location_type: "shop", shop_name: "Laredo Truck Repair" });
  });

  it("no documents: no postings query, empty legs -- never invented", async () => {
    let postingsQueried = false;
    const client = {
      query: async <T>(sql: string): Promise<{ rows: T[] }> => {
        if (sql.includes("journal_entry_postings")) postingsQueried = true;
        if (sql.includes("FROM maintenance.work_orders w")) return { rows: [{ unit_id: "u1", unit_number: "T150", driver_at_time_id: null, driver_at_time_name: null, vendor_id: null, vendor_name: null, at: null, load_id: null, roadside_load_id: null }] as T[] };
        return { rows: [] as T[] };
      },
    };
    const link = await loadWorkOrderLinkage(client, OPCO, WO);
    expect(postingsQueried).toBe(false);
    expect(link).toMatchObject({ driver_at_time: null, vendor: null, bills: [], bill_payments: [], expenses: [], journal_entries: [], loads: [], load_invoices: [], received_payments: [] });
  });
});

describe("E-16 three dates keep their order", () => {
  it("accepts reported <= in shop <= expected release, and partial sets", () => {
    expect(workOrderDateOrderError({ reported_at: "2026-09-29T10:00:00Z", in_shop_at: "2026-09-30T08:00:00Z", expected_release_at: "2026-10-02T17:00:00Z" })).toBeNull();
    expect(workOrderDateOrderError({ in_shop_at: "2026-09-30T08:00:00Z" })).toBeNull();
  });
  it("refuses an out-of-order pair", () => {
    expect(workOrderDateOrderError({ reported_at: "2026-09-30T10:00:00Z", in_shop_at: "2026-09-29T08:00:00Z" })).toBe("in_shop_at_before_reported_at");
    expect(workOrderDateOrderError({ in_shop_at: "2026-09-30T08:00:00Z", expected_release_at: "2026-09-29T17:00:00Z" })).toBe("expected_release_at_before_in_shop_at");
  });
});
