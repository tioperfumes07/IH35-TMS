// ACCT-F11112 — the WEX Transaction Report PDF and the Enhanced Transaction Report .xlsx become statement lines that foot
// to the report's own grand total; the grouped sub-total rows never import; a mistyped unit falls back to the card's truck.
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseWexTransactionReportPdf, wexReportControl, wexReportToStatementLines } from "../wex-transaction-report-pdf.js";
import { parseWexEnhancedReportGrid, wexEnhancedControl, wexEnhancedToStatementLines } from "../wex-enhanced-transaction-report.js";
import { withCardUnitFallback } from "../dreamline-statement-import.service.js";

/** A minimal JasperReports-shaped PDF: one FlateDecode content stream per page, one "x y Tm (text)Tj" per field. */
function jasperPdf(pages: Array<Array<[number, number, string]>>): Buffer {
  const parts: string[] = ["%PDF-1.4\n"];
  pages.forEach((fields, i) => {
    const body = fields.map(([x, y, t]) => `BT\n1 0 0 1 ${x} ${y} Tm\n/F1 7 Tf\n0 0 0 rg\n(${t.replace(/([()\\])/g, "\\$1")})Tj\n0 g\nET\n`).join("");
    const z = zlib.deflateSync(Buffer.from(body, "latin1")).toString("latin1");
    parts.push(`${i + 4} 0 obj\n<</Filter/FlateDecode/Length ${z.length}>>stream\n${z}\nendstream\nendobj\n`);
  });
  parts.push("%%EOF\n");
  return Buffer.from(parts.join(""), "latin1");
}

const header: Array<[number, number, string]> = [
  [21, 568.27, "Carrier:"], [61, 566.82, "USMCA FREIGHT"], [61, 558.42, "SOLUTIONS"], [315, 568.22, "2026-10-01"], [427, 568.22, "2026-10-31"],
  [744.99, 550.27, "Total Records:"], [798, 550.22, "3"],
  [20, 537.2, "Card #"], [91, 537.2, "Tran Date"], [154, 537.2, "Invoice"], [196, 537.2, "Unit"], [230, 537.2, "Driver Name"],
  [320, 537.2, "Odometer"], [367, 537.2, "Location Name"], [455, 537.2, "City"], [527, 535.8, "State/"], [557.44, 537.2, "Fees"],
  [588.39, 537.2, "Item"], [606.66, 537.2, "Unit Price"], [704.11, 537.2, "Qty"], [775.55, 537.2, "Amt"],
];
const ticket: Array<[number, number, string]> = [
  [20, 517.9, "00006"], [91, 517.9, "2026-10-11"], [154, 517.9, "65395"], [196, 517.9, "176"], [230, 517.9, "Neftalia Coronado"],
  [320, 517.9, "433925"], [367, 517.9, "LOVES #471 TRAVEL STOP"], [455, 517.9, "NATALIA"], [527, 517.9, "TX"],
  [586, 517.9, "ULSD"], [621.99, 517.9, "5.558"], [696.65, 517.9, "203.86"], [766.65, 517.9, "1,133.24"],
  [585.67, 508.9, "DEFD"], [621.99, 508.9, "4.889"], [699.99, 508.9, "17.44"], [774.99, 508.9, "85.26"],
  [20, 499.9, "00154"], [91, 499.9, "2026-10-22"], [154, 499.9, "94166"], [196, 499.9, "052"],
  [367, 499.9, "LOVES #762 TRAVEL STOP"], [455, 499.9, "LAREDO"], [527, 499.9, "TX"],
  [586, 499.9, "ULSD"], [621.99, 499.9, "5.868"], [696.65, 499.9, "100.00"], [766.65, 499.9, "586.83"],
  [20, 480, "Group:       1    00006"],
];
const grand = (total: string): Array<[number, number, string]> => [[300, 500, "Grand Totals"], [20, 400, "Totals"], [80, 400, total]];

describe("WEX Transaction Report PDF (ACCT-F11112)", () => {
  it("reads every ticket product line with its ticket's card / date / invoice / unit and foots to the Grand Total", () => {
    const report = parseWexTransactionReportPdf(jasperPdf([[...header, ...ticket], grand("1,805.33")]));
    expect(report.carrier_name).toBe("USMCA FREIGHT SOLUTIONS");
    expect(report.rows.map((r) => [r.card, r.invoice, r.unit, r.item, r.qty, r.amt])).toEqual([
      ["00006", "65395", "176", "ULSD", 203.86, 1133.24],
      ["00006", "65395", "176", "DEFD", 17.44, 85.26],
      ["00154", "94166", "052", "ULSD", 100, 586.83],
    ]);
    expect(wexReportControl(report)).toMatchObject({ ok: true, parsed_cents: 180533, grand_total_cents: 180533, total_records: 3 });
    const { lines } = wexReportToStatementLines(report);
    expect(lines[1]).toMatchObject({ efs_invoice: "65395", product: "def", net_cents: 8526, gross_cents: 8526, discount_cents: 0, time_known: false, state: "TX" });
  });
  it("refuses (ok=false) a file whose lines do not foot to the report Grand Total", () => {
    expect(wexReportControl(parseWexTransactionReportPdf(jasperPdf([[...header, ...ticket], grand("1,805.34")]))).ok).toBe(false);
  });
});

describe("WEX Enhanced Transaction Report .xlsx (ACCT-F11112)", () => {
  const H = ["Quantity", "Card Number", null, "Category/Product Code", "Amount", "Transaction Date", "Transaction ID", "Transaction Time",
    "Location Name", "Location City", "Location State/Province", "Carrier Id", "Invoice", "Line Item Discount", "Line Item Gross", "Retail PPU", "Driver Name", "Unit"];
  const detail = (q: number, card: string, item: string, amt: number, date: string, txid: string, time: string, inv: string, disc: number, gross: number, unit: string) =>
    [q, card, null, item, amt, date, txid, time, "LOVES #856 TRAVEL STOP", "MANDEVILLE", "LA", "5290229", inv, disc, gross, 6.189, "Fernado Mecor", unit];
  const sub = (q: number, card: string | null, item: string | null, amt: number) => [q, card, null, item, amt, null, null, null, null, null, null, null, null, 0, amt, null, null, null];
  const grid = (grandAmt: number) => [
    ["Report Name: New Report"], ["Printed on: 11/9/26 7:03 PM"], H,
    detail(0.89, "*0055", "DEFD", 4.37, "2026-10-28", "1597102059", "22:10", "61272", 0, 4.37, "168"),
    sub(0.89, "*0055", "DEFD", 4.37), sub(0.89, "*0055", null, 4.37), sub(0.89, null, null, 4.37),
    detail(97, "*0055", "ULSD", 558.1, "2026-11-04", "1599568044", "11:04", "65427", 42.23, 600.33, "168"),
    sub(97, "*0055", "ULSD", 558.1), sub(97, null, null, 558.1),
    [97.89, null, null, null, grandAmt],
  ];
  it("takes the detail rows only (a Transaction ID), never the grouped sub-total rows, and foots to the grand-total row", () => {
    const report = parseWexEnhancedReportGrid(grid(562.47))!;
    expect(report.body_rows).toBe(8);
    expect(report.lines.map((l) => [l.transaction_id, l.invoice, l.item, l.amount])).toEqual([
      ["1597102059", "61272", "DEFD", 4.37],
      ["1599568044", "65427", "ULSD", 558.1],
    ]);
    expect(wexEnhancedControl(report)).toMatchObject({ ok: true, parsed_cents: 56247, grand_total_cents: 56247 });
    const { lines } = wexEnhancedToStatementLines(report);
    expect(lines[1]).toMatchObject({ card_number: "*0055", net_cents: 55810, gross_cents: 60033, discount_cents: 4223, time_known: true, provider_transaction_id: "1599568044", local_date: "2026-11-04" });
    expect(lines[1]!.transaction_at).toBe("2026-11-04T17:04:00.000Z"); // 11:04 Central (CST)
  });
  it("a report that does not foot to its grand total is refused", () => {
    expect(wexEnhancedControl(parseWexEnhancedReportGrid(grid(562.48))!).ok).toBe(false);
  });
  it("a sheet without the Enhanced header is not this report", () => {
    expect(parseWexEnhancedReportGrid([["Card #", "Tran Date", "Disc PPU"]])).toBeNull();
  });
});

describe("withCardUnitFallback (ACCT-F11112)", () => {
  it("a mistyped unit carries the card's own truck from its other lines; a truck the card runs keeps its unit", () => {
    const l = (card: string, unit: string) => ({ card_number: card, unit_label: unit, unit_fallback_label: null as string | null });
    const out = withCardUnitFallback([l("00154", "152"), l("00154", "152"), l("00154", "052"), l("00097", "124"), l("00097", "156")]);
    expect(out.map((x) => x.unit_fallback_label)).toEqual([null, null, "152", null, null]);
  });
});
