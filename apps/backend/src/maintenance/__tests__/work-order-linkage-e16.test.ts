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
          return rows([{ unit_id: "u1", unit_number: "T174", driver_at_time_id: "d1", driver_at_time_name: "Juan Perez", vendor_id: "v1", vendor_name: "Laredo Truck Repair", at: "2026-09-30 12:00:00+00" }]);
        }
        if (sql.includes("FROM accounting.bills")) return rows([{ id: "b1", display_id: "BILL-1", bill_number: "INV-9", amount_cents: "125000", status: "posted", voided_at: null }]);
        if (sql.includes("FROM accounting.expenses")) return rows([{ id: "e1", total_amount_cents: "4000", status: "posted", journal_entry_id: "j2", voided_at: null }]);
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
  });

  it("no documents: no postings query, empty legs -- never invented", async () => {
    let postingsQueried = false;
    const client = {
      query: async <T>(sql: string): Promise<{ rows: T[] }> => {
        if (sql.includes("journal_entry_postings")) postingsQueried = true;
        if (sql.includes("FROM maintenance.work_orders w")) return { rows: [{ unit_id: "u1", unit_number: "T150", driver_at_time_id: null, driver_at_time_name: null, vendor_id: null, vendor_name: null, at: null }] as T[] };
        return { rows: [] as T[] };
      },
    };
    const link = await loadWorkOrderLinkage(client, OPCO, WO);
    expect(postingsQueried).toBe(false);
    expect(link).toMatchObject({ driver_at_time: null, vendor: null, bills: [], expenses: [], journal_entries: [] });
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
