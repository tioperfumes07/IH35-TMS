import { describe, expect, it } from "vitest";
import { historyRowsFromWorkbook } from "../PerfumeRankingPanel";

// Owner's customer sales workbook: USA monthly detail + México yearly MXN; purchases only, no balances (owner 14:12 CT).
describe("historyRowsFromWorkbook", () => {
  it("reads USA months (a nameless customer keeps its number) and México years; skips the TOTAL row", () => {
    const head = [["title"], ["note"], [null], ["Customer No.", "Customer Name", "Month", "No. of Invoices", "Sub-Total", "Tax", "Total"]];
    const rows = historyRowsFromWorkbook([
      { name: "Detalle Mensual", cells: [...head, [102122, "Shopeasy LLC", 44044, 1, 86137.61, 0, 86137.61], [22522, null, 44593, 1, 491.25, 0, 491.25], [null, "TOTAL", null, 18050, 1, 1, 77243596.3]] },
      { name: "Clientes México", cells: [["t"], ["n"], [null], ["No."], [1, "Coppel S.A. de C.V.", null, 13420235.08, 0, null, null, 5, "=SUM"]] },
    ]);
    expect(rows).toEqual([
      { source: "usa_store", customer_no: "102122", customer_name: "Shopeasy LLC", period_kind: "month", period_start: "2020-08-01", invoices: 1, amount_cents: 8613761, currency: "USD" },
      { source: "usa_store", customer_no: "22522", customer_name: "Customer #22522 (no name in store system)", period_kind: "month", period_start: "2022-02-01", invoices: 1, amount_cents: 49125, currency: "USD" },
      { source: "mexico_file", customer_no: "1", customer_name: "Coppel S.A. de C.V.", period_kind: "year", period_start: "2021-01-01", invoices: null, amount_cents: 1342023508, currency: "MXN" },
      { source: "mexico_file", customer_no: "1", customer_name: "Coppel S.A. de C.V.", period_kind: "year", period_start: "2025-01-01", invoices: null, amount_cents: 500, currency: "MXN" },
    ]);
  });
});
