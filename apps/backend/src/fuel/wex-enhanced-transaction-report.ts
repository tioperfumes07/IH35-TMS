/**
 * ACCT-F11112 — the WEX "Enhanced Transaction Report" (.xlsx, sheet "Data"): the WEX export the owner names the source
 * of record (owner 2026-11-09 19:06: "seed the data correctly"). Title rows 1-3 ("Enhanced Transaction Report", "Report
 * Name", "Printed on"), the column header on row 4, then a GROUPED body: every product line is printed once as a DETAIL
 * row (it carries the Transaction ID, Invoice, Transaction Date / Time, Unit, Driver Name, Location) followed by its
 * group sub-total rows (the same Quantity / Amount repeated under each grouping level, no Transaction ID), and the last
 * row is the report's grand total (Quantity, Amount — no card).
 *
 * Only DETAIL rows are lines. Measured on EnhancedTransactionReport-3.xlsx (10-09 -> 11-05): 1,560 body rows = 267 detail
 * lines + 1,293 sub-total rows; the detail Amounts sum to the grand-total row (97,695.85); October's 217 detail lines are
 * the October Transaction Report PDF line for line (invoice + item + amount) and foot to its Grand Total 81,187.77.
 *
 * Per line: Amount = what WEX charged (net), Line Item Gross = pump retail, Line Item Discount = the discount
 * (gross − discount = Amount; when a row does not foot, the charge stands alone: gross = net, discount 0). The fill time
 * IS printed (Transaction Time), so the fill moment is stamped from it. The Transaction ID rides into the row notes.
 *
 * Pure: the caller hands the sheet as a grid (one array per spreadsheet row, cells in column order).
 */
import type { DreamlineStatementLine } from "./dreamline-statement-import.service.js";
import { dreamlineProduct, statementInstant } from "./dreamline-statement-import.service.js";

export type WexEnhancedLine = {
  transaction_id: string; invoice: string; card: string; date: string; time: string | null; unit: string | null;
  driver: string | null; location: string | null; city: string | null; state: string | null; item: string;
  quantity: number | null; amount: number; line_gross: number | null; line_discount: number | null; retail_ppu: number | null;
  sheet_row: number;
};

export type WexEnhancedReport = {
  header_row: number;
  carrier_ids: string[];
  body_rows: number;
  lines: WexEnhancedLine[];
  grand_total_cents: number | null;
  grand_total_quantity: number | null;
};

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
  }
  const s = txt(v);
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (mdy) { const y = mdy[3]!.length === 2 ? `20${mdy[3]}` : mdy[3]!; return `${y}-${mdy[1]!.padStart(2, "0")}-${mdy[2]!.padStart(2, "0")}`; }
  return null;
};

/** True when the grid's header (within its first 10 rows) is the Enhanced Transaction Report's. */
export function findWexEnhancedHeaderRow(grid: unknown[][]): number {
  for (let i = 0; i < Math.min(grid.length, 10); i += 1) {
    const cells = (grid[i] ?? []).map((c) => txt(c));
    if (cells.includes("Transaction ID") && cells.includes("Card Number") && cells.includes("Category/Product Code") && cells.includes("Amount")) return i;
  }
  return -1;
}

export function parseWexEnhancedReportGrid(grid: unknown[][]): WexEnhancedReport | null {
  const h = findWexEnhancedHeaderRow(grid);
  if (h < 0) return null;
  const header = (grid[h] ?? []).map((c) => txt(c));
  const col = (name: string) => header.indexOf(name);
  const C = {
    qty: col("Quantity"), card: col("Card Number"), item: col("Category/Product Code"), amount: col("Amount"),
    date: col("Transaction Date"), txid: col("Transaction ID"), time: col("Transaction Time"), location: col("Location Name"),
    city: col("Location City"), state: col("Location State/Province"), carrier: col("Carrier Id"), invoice: col("Invoice"),
    gross: col("Line Item Gross"), discount: col("Line Item Discount"), retail: col("Retail PPU"), unit: col("Unit"),
    driver: col("Driver Name"),
  };
  const at = (row: unknown[], i: number) => (i >= 0 ? row[i] : undefined);
  const report: WexEnhancedReport = { header_row: h, carrier_ids: [], body_rows: 0, lines: [], grand_total_cents: null, grand_total_quantity: null };
  const carriers = new Set<string>();
  const body = grid.slice(h + 1).filter((r) => (r ?? []).some((c) => txt(c) !== null));
  report.body_rows = body.length;
  body.forEach((row, idx) => {
    const txid = txt(at(row, C.txid));
    if (!txid) return;
    const carrier = txt(at(row, C.carrier));
    if (carrier) carriers.add(carrier);
    const amount = numOrNull(at(row, C.amount));
    const item = txt(at(row, C.item));
    const date = isoDate(at(row, C.date));
    const card = txt(at(row, C.card));
    const invoice = txt(at(row, C.invoice));
    if (amount === null || !item || !date || !card || !invoice) return;
    report.lines.push({
      transaction_id: txid, invoice, card, date, time: txt(at(row, C.time)), unit: txt(at(row, C.unit)),
      driver: txt(at(row, C.driver)), location: txt(at(row, C.location)), city: txt(at(row, C.city)),
      state: txt(at(row, C.state)), item: item.toUpperCase(), quantity: numOrNull(at(row, C.qty)), amount,
      line_gross: numOrNull(at(row, C.gross)), line_discount: numOrNull(at(row, C.discount)),
      retail_ppu: numOrNull(at(row, C.retail)), sheet_row: h + 2 + idx,
    });
  });
  report.carrier_ids = [...carriers];
  // the grand total: the LAST body row — no card, no product, a Quantity and an Amount
  const last = body[body.length - 1];
  if (last && !txt(at(last, C.card)) && !txt(at(last, C.item)) && !txt(at(last, C.txid))) {
    const a = numOrNull(at(last, C.amount));
    report.grand_total_cents = a === null ? null : Math.round(a * 100);
    report.grand_total_quantity = numOrNull(at(last, C.qty));
  }
  return report;
}

/** The report's detail lines in the statement engine's shape (time printed -> time_known). */
export function wexEnhancedToStatementLines(report: WexEnhancedReport): {
  lines: DreamlineStatementLine[];
  dead_letters: Array<{ line_number: number; reason: string }>;
} {
  const lines: DreamlineStatementLine[] = [];
  const dead_letters: Array<{ line_number: number; reason: string }> = [];
  for (const r of report.lines) {
    const when = statementInstant(r.date, r.time);
    if (!when) { dead_letters.push({ line_number: r.sheet_row, reason: `unreadable Transaction Date ${r.date}` }); continue; }
    const net = Math.round(r.amount * 100);
    const gross = r.line_gross === null ? null : Math.round(r.line_gross * 100);
    const disc = r.line_discount === null ? null : Math.round(r.line_discount * 100);
    const foots = gross !== null && disc !== null && gross - disc === net && disc >= 0;
    lines.push({
      line_number: r.sheet_row,
      card_number: r.card,
      transaction_at: when.at.toISOString(),
      local_date: when.local_date,
      efs_invoice: r.invoice,
      unit_label: r.unit,
      driver_name: r.driver,
      location_name: r.location,
      city: r.city,
      state: r.state ? r.state.slice(0, 2).toUpperCase() : null,
      item: r.item,
      product: dreamlineProduct(r.item),
      quantity: r.quantity,
      retail_ppu: r.retail_ppu,
      gross_cents: foots ? gross! : net,
      discount_cents: foots ? disc! : 0,
      net_cents: net,
      fee_cents: 0,
      time_known: r.time !== null,
      provider_transaction_id: r.transaction_id,
    });
  }
  return { lines, dead_letters };
}

/** The control the route enforces: the detail lines foot to the report's grand-total row. */
export function wexEnhancedControl(report: WexEnhancedReport): { ok: boolean; parsed_lines: number; parsed_cents: number; grand_total_cents: number | null; body_rows: number } {
  const parsed_cents = report.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  return {
    ok: report.grand_total_cents !== null && report.lines.length > 0 && parsed_cents === report.grand_total_cents,
    parsed_lines: report.lines.length, parsed_cents, grand_total_cents: report.grand_total_cents, body_rows: report.body_rows,
  };
}

/** Rows read by readUntrustedSpreadsheetRows (row 1 = keys) -> the sheet grid from row 2 on, cells in column order. */
export function spreadsheetRowsToGrid(rows: Record<string, unknown>[]): unknown[][] {
  return rows.map((r) => Object.values(r));
}
