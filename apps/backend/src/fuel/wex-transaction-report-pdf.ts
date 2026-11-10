/**
 * ACCT-F11112 — the WEX "Transaction Report" PDF (JasperReports / iText export the owner downloads from WEX: carrier
 * USMCA FREIGHT SOLUTIONS, grouped by card) -> the England WEX statement lines the ONE statement engine walks
 * (dreamline-statement-import.service.ts, WEX_STATEMENT_RAIL -> card payable 2520).
 *
 * Owner 2026-11-09: "dreamline has not been used, we are using wex. i need to get that report." The upload route took only
 * the .csv/.xlsx export (Card #, Tran Time, Disc PPU, Disc Amt); the monthly report WEX sends is a PDF with Card #, Tran
 * Date, Invoice, Unit, Driver Name, Odometer, Location Name, City, State/Prov, Fees, Item, Unit Price, Qty, Amt — no
 * time, no discount columns. Amt is what WEX charged (the discounted amount: invoice 65157 Amt 1,262.68 = the charge
 * booked on settlement), so net = gross = Amt, discount 0, and the line carries time_known=false (the fill moment is
 * never stamped from a placeholder clock).
 *
 * Deterministic text extraction — no AI, no external tool: the report's page streams are FlateDecode content with one
 * absolute text matrix per field ("1 0 0 1 x y Tm (text)Tj", standard Helvetica, WinAnsi). Fields are grouped into
 * printed rows by y and assigned to columns by the header row's x bands; the numeric tail (Item, Unit Price, Qty, Amt)
 * is right-aligned so it is read in order. A product line under a ticket (the DEFD under a ULSD) inherits the ticket's
 * card / date / invoice / unit / driver / location.
 *
 * Control totals: the report's own "Grand Totals -> Totals" and "Total Records" are read and returned; the route
 * refuses a file whose parsed lines do not foot to them (never a silent partial import).
 */
import zlib from "node:zlib";
import type { DreamlineStatementLine } from "./dreamline-statement-import.service.js";
import { dreamlineProduct, statementInstant } from "./dreamline-statement-import.service.js";

export type PdfTextItem = { page: number; x: number; y: number; text: string };

function unescapePdfString(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, g: string) => {
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[g] ?? g;
  });
}

/** Every positioned text field of every FlateDecode content stream, in page order. */
export function extractPdfTextItems(pdf: Buffer): PdfTextItem[] {
  const src = pdf.toString("latin1");
  const items: PdfTextItem[] = [];
  const streamRe = /<<([^]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  let page = 0;
  while ((m = streamRe.exec(src))) {
    const dict = m[1] ?? "";
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    streamRe.lastIndex = end;
    if (!/\/FlateDecode/.test(dict)) continue;
    let body: string;
    try {
      body = zlib.inflateSync(Buffer.from(src.slice(start, end).replace(/\r?\n$/, ""), "latin1")).toString("latin1");
    } catch {
      continue;
    }
    if (!/\bTj\b/.test(body)) continue;
    page += 1;
    // each BT..ET block may set several matrices; a string is placed at the last matrix before it
    const tokRe = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    let x = 0;
    let y = 0;
    let t: RegExpExecArray | null;
    while ((t = tokRe.exec(body))) {
      if (t[1] !== undefined) { x = Number(t[5]); y = Number(t[6]); continue; }
      const text = unescapePdfString(t[7] ?? "").trim();
      if (text !== "") items.push({ page, x, y, text });
    }
  }
  return items;
}

const COLUMNS = ["Card #", "Tran Date", "Invoice", "Unit", "Driver Name", "Odometer", "Location Name", "City", "State/", "Fees", "Item"] as const;
type Col = (typeof COLUMNS)[number];

export type WexReportRow = {
  card: string; date: string; invoice: string; unit: string | null; driver: string | null; odometer: string | null;
  location: string | null; city: string | null; state: string | null; fees: number; item: string; unit_price: number | null;
  qty: number | null; amt: number; page: number;
};

export type WexTransactionReport = {
  carrier_name: string | null;
  carrier_id: string | null;
  start_date: string | null;
  end_date: string | null;
  total_records: number | null;
  grand_total_cents: number | null;
  rows: WexReportRow[];
};

const money = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Pure: the report's text fields -> its ticket product lines + control totals. */
export function parseWexTransactionReportItems(items: PdfTextItem[]): WexTransactionReport {
  const report: WexTransactionReport = { carrier_name: null, carrier_id: null, start_date: null, end_date: null, total_records: null, grand_total_cents: null, rows: [] };
  const pages = new Map<number, PdfTextItem[]>();
  for (const it of items) pages.set(it.page, [...(pages.get(it.page) ?? []), it]);
  let ticket: Omit<WexReportRow, "item" | "unit_price" | "qty" | "amt" | "fees" | "page"> | null = null;
  for (const [page, its] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    // printed rows: same baseline (within 0.6pt)
    const rows: PdfTextItem[][] = [];
    for (const it of [...its].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r[0]!.y - it.y) <= 0.6);
      if (row) row.push(it); else rows.push([it]);
    }
    rows.forEach((r) => r.sort((a, b) => a.x - b.x));
    const header = rows.find((r) => r.some((i) => i.text === "Card #") && r.some((i) => i.text === "Tran Date"));
    const flat = its.map((i) => i.text);
    const after = (label: string) => { const i = its.find((t) => t.text === label); if (!i) return undefined; return rows.find((r) => r.includes(i))?.filter((t) => t.x > i.x).sort((a, b) => a.x - b.x)[0]?.text; };
    if (report.carrier_id === null) {
      const lbl = its.find((t) => /^Carrier Id/.test(t.text));
      if (lbl) {
        const val = lbl.text.replace(/^Carrier Id\s*/, "").trim() || its.filter((t) => Math.abs(t.y - lbl.y) <= 1 && t.x > lbl.x).sort((a, b) => a.x - b.x)[0]?.text;
        report.carrier_id = /^\d+$/.test(val ?? "") ? val! : null;
      }
      const dates = its.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.text) && header && t.y > header[0]!.y).sort((a, b) => a.x - b.x);
      if (dates.length >= 2) { report.start_date = dates[0]!.text; report.end_date = dates[1]!.text; }
      const carrier = its.find((t) => t.text === "Carrier:");
      if (carrier) {
        report.carrier_name = its.filter((t) => t.x > carrier.x && t.x < carrier.x + 120 && Math.abs(t.y - carrier.y) <= 12 && !/:$/.test(t.text) && !/^\d/.test(t.text))
          .sort((a, b) => b.y - a.y).map((t) => t.text).join(" ") || null;
      }
    }
    const tr = after("Total Records:");
    if (tr && /^\d+$/.test(tr)) report.total_records = Number(tr);
    if (flat.includes("Grand Totals")) {
      const totals = rows.find((r) => r[0]?.text === "Totals");
      const v = money(totals?.[1]?.text);
      if (v !== null) report.grand_total_cents = Math.round(v * 100);
      continue;
    }
    if (!header) continue;
    const band = new Map<Col, number>();
    for (const c of COLUMNS) { const h = header.find((i) => i.text === c) ?? rows.flat().find((i) => i.text === c); if (h) band.set(c, h.x); }
    const itemX = (band.get("Item") ?? 588) - 6;
    const colOf = (x: number): Col | null => {
      let best: Col | null = null;
      for (const c of COLUMNS) { const bx = band.get(c); if (bx !== undefined && x >= bx - 2.5 && c !== "Item") best = c; }
      return best;
    };
    for (const r of rows) {
      if (r === header || r[0]!.y >= header[0]!.y - 0.1) continue;
      if (r[0]!.text.startsWith("Group:")) { ticket = null; continue; }
      const tail = r.filter((i) => i.x >= itemX);
      const item = tail[0]?.text;
      if (!item || !/^[A-Z]{3,5}$/.test(item) || tail.length < 4) continue;
      const lead = r.filter((i) => i.x < itemX);
      const cells: Partial<Record<Col, string>> = {};
      for (const i of lead) { const c = colOf(i.x); if (c) cells[c] = cells[c] ? `${cells[c]} ${i.text}` : i.text; }
      if (cells["Card #"] && cells["Tran Date"] && cells["Invoice"]) {
        ticket = {
          card: cells["Card #"]!, date: cells["Tran Date"]!, invoice: cells["Invoice"]!, unit: cells["Unit"] ?? null,
          driver: cells["Driver Name"] ?? null, odometer: cells["Odometer"] ?? null, location: cells["Location Name"] ?? null,
          city: cells["City"] ?? null, state: cells["State/"] ?? null,
        };
      }
      if (!ticket) continue;
      const amt = money(tail[3]?.text);
      if (amt === null) continue;
      report.rows.push({
        ...ticket, fees: money(cells["Fees"]) ?? 0, item, unit_price: money(tail[1]?.text), qty: money(tail[2]?.text), amt, page,
      });
    }
  }
  return report;
}

export function parseWexTransactionReportPdf(pdf: Buffer): WexTransactionReport {
  return parseWexTransactionReportItems(extractPdfTextItems(pdf));
}

/** The report's lines in the statement engine's shape: Amt is the charge (net = gross, discount 0), time not printed. */
export function wexReportToStatementLines(report: WexTransactionReport): {
  lines: DreamlineStatementLine[];
  dead_letters: Array<{ line_number: number; reason: string }>;
} {
  const lines: DreamlineStatementLine[] = [];
  const dead_letters: Array<{ line_number: number; reason: string }> = [];
  report.rows.forEach((r, idx) => {
    const line_number = idx + 1;
    const when = statementInstant(r.date, null);
    if (!when) { dead_letters.push({ line_number, reason: `unreadable Tran Date ${r.date}` }); return; }
    const net = Math.round(r.amt * 100);
    lines.push({
      line_number,
      card_number: r.card,
      transaction_at: when.at.toISOString(),
      local_date: when.local_date,
      efs_invoice: r.invoice,
      unit_label: r.unit,
      driver_name: r.driver,
      location_name: r.location,
      city: r.city,
      state: r.state ? r.state.slice(0, 2).toUpperCase() : null,
      item: r.item.toUpperCase(),
      product: dreamlineProduct(r.item),
      quantity: r.qty,
      retail_ppu: r.unit_price,
      gross_cents: net,
      discount_cents: 0,
      net_cents: net,
      fee_cents: Math.round(r.fees * 100),
      time_known: false,
    });
  });
  return { lines, dead_letters };
}

/** The control the route enforces: parsed lines foot to the report's Grand Total and its Total Records. */
export function wexReportControl(report: WexTransactionReport): { ok: boolean; parsed_lines: number; parsed_cents: number; total_records: number | null; grand_total_cents: number | null } {
  const parsed_cents = report.rows.reduce((s, r) => s + Math.round(r.amt * 100) + Math.round(r.fees * 100), 0);
  const ok = report.grand_total_cents !== null && parsed_cents === report.grand_total_cents
    && (report.total_records === null || report.total_records === report.rows.length);
  return { ok, parsed_lines: report.rows.length, parsed_cents, total_records: report.total_records, grand_total_cents: report.grand_total_cents };
}
