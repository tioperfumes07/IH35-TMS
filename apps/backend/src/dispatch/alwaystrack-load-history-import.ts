/**
 * ACCT-F11108 (owner order 2026-11-09 18:42 CT: "in my downloads folders there is load history ... get the data seeded
 * instantly in the app. not manually not one by one") — the AlwaysTrack "LOAD HISTORY" export, read as one file.
 *
 * ROOT CAUSE this module closes: the app had no importer for this export. The only HTTP load-create path
 * (POST /api/v1/dispatch/loads) books live_feed — it refuses a city-only stop and judges a load that already ran on the
 * driver's CURRENT hours — and the export prints city/state only. The one historical path (bookLoadOnClient with
 * source historical_backfill) was reachable only through the Settlement Creator, one signed settlement at a time.
 *
 * This file is the PURE half: parse the workbook (header row "Load#" ... found by content, never by a fixed row
 * number) and turn each row into the facts the booking needs. No database, no money math: the line-haul charge is the
 * export's own "Charges" column; the short (pay) miles are the export's own Driver Pay / Driver R.P.M (owner law 443.192:
 * per-mile drivers are paid short miles — the bill then reproduces AlwaysTrack's Driver Pay through the existing engine).
 */
import ExcelJS from "exceljs";

export type AlwaysTrackLoadHistoryRow = {
  load_number: string;
  settlement_no: string | null;
  customer_name: string;
  invoice: string | null;
  wo_number: string | null;
  origin: { city: string; state: string };
  destination: { city: string; state: string };
  picks_drops: string | null;
  pickup_date: string;
  delivery_date: string;
  driver_name: string;
  truck_number: string;
  trailer_number: string | null;
  trailer_type: string | null;
  at_status: string;
  st_miles: number | null;
  l_miles: number | null;
  e_miles: number | null;
  driver_pay: number | null;
  driver_rpm: number | null;
  charges_cents: number;
  qp_cents: number;
  total_cents: number;
};

export type LoadHistoryParse = {
  title: string | null;
  range_label: string | null;
  invoiced_by: string | null;
  rows: AlwaysTrackLoadHistoryRow[];
  /** The export's own "(N) Totals:" line — the parse is checked against it, never trusted blind. */
  totals: { count: number | null; charges_cents: number | null };
};

export class LoadHistoryParseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LoadHistoryParseError";
    this.code = code;
  }
}

const REQUIRED_HEADERS = ["Load#", "Customer", "W.O.", "Orig-Dest", "Pickup", "Delivery", "Driver", "Truck#", "Trailer", "Status", "Charges"] as const;

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText((v as { result: ExcelJS.CellValue }).result);
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    return "";
  }
  return String(v);
}

function num(v: string): number | null {
  const t = v.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function cents(v: string): number {
  const n = num(v);
  return n == null ? 0 : Math.round(n * 100);
}

/** "MONTE VISTA, CO - HIDALGO, TX" -> two city/state pairs. The split is on " - " between two "City, ST" halves. */
export function splitOrigDest(raw: string): { origin: { city: string; state: string }; destination: { city: string; state: string } } {
  const m = /^(.+?,\s*[A-Za-z. ]+?)\s+-\s+(.+?,\s*[A-Za-z. ]+?)$/.exec(raw.trim());
  if (!m) throw new LoadHistoryParseError("orig_dest_unreadable", `Orig-Dest "${raw}" is not "City, ST - City, ST".`);
  const half = (s: string) => {
    const i = s.lastIndexOf(",");
    const city = s.slice(0, i).trim();
    const state = s.slice(i + 1).trim().replace(/\.$/, "").toUpperCase();
    if (!city || !state) throw new LoadHistoryParseError("orig_dest_unreadable", `Orig-Dest "${raw}" has a blank city or state.`);
    return { city: titleCase(city), state };
  };
  return { origin: half(m[1]!), destination: half(m[2]!) };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

function isoDay(raw: string, field: string, load: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  throw new LoadHistoryParseError("date_unreadable", `Load ${load}: ${field} "${raw}" is not a date.`);
}

export async function parseAlwaysTrackLoadHistory(buffer: Buffer | ArrayBuffer): Promise<LoadHistoryParse> {
  const wb = new ExcelJS.Workbook();
  // exceljs's own typings predate Node's generic Buffer; the bytes are the same.
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) throw new LoadHistoryParseError("no_worksheet", "The workbook has no worksheet.");

  const lines: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const vals: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c += 1) vals.push(cellText(row.getCell(c).value).trim());
    lines[rowNumber - 1] = vals;
  });
  const headerIdx = lines.findIndex((l) => l && l[0] === "Load#");
  if (headerIdx < 0) throw new LoadHistoryParseError("header_not_found", 'No header row starting with "Load#" — this is not an AlwaysTrack LOAD HISTORY export.');
  const header = lines[headerIdx]!.map((h) => h.replace(/\s+/g, " ").trim());
  const col = (name: string) => header.findIndex((h) => h === name);
  const missing = REQUIRED_HEADERS.filter((h) => col(h) < 0);
  if (missing.length) throw new LoadHistoryParseError("header_missing_columns", `LOAD HISTORY header is missing: ${missing.join(", ")}.`);

  const above = lines.slice(0, headerIdx).map((l) => (l ?? []).find((v) => v) ?? "").filter(Boolean);
  const title = above.find((t) => /^LOAD HISTORY$/i.test(t)) ?? null;
  if (!title) throw new LoadHistoryParseError("title_not_found", 'The sheet does not carry the "LOAD HISTORY" title.');
  const range_label = above.find((t) => /^LOADS FROM /i.test(t)) ?? null;
  const invoiced_by = above.find((t) => /^Invoiced By /i.test(t)) ?? null;

  const get = (l: string[], name: string) => l[col(name)] ?? "";
  const rows: AlwaysTrackLoadHistoryRow[] = [];
  const totals: LoadHistoryParse["totals"] = { count: null, charges_cents: null };
  for (const l of lines.slice(headerIdx + 1)) {
    if (!l || !l.some((v) => v)) continue;
    const first = l[0] ?? "";
    const tot = /^\((\d+)\)\s*Totals/i.exec(first);
    if (tot) {
      totals.count = Number(tot[1]);
      totals.charges_cents = cents(get(l, "Charges"));
      break;
    }
    if (!/^\d+$/.test(first)) throw new LoadHistoryParseError("load_number_unreadable", `Row "${first}" has no numeric Load#.`);
    const od = splitOrigDest(get(l, "Orig-Dest"));
    const trailerRaw = get(l, "Trailer");
    const [trailerNo, ...trailerRest] = trailerRaw.split(" - ");
    rows.push({
      load_number: first,
      settlement_no: get(l, "Settl.#") || null,
      customer_name: get(l, "Customer"),
      invoice: get(l, "Invoice") || null,
      wo_number: get(l, "W.O.") || null,
      origin: od.origin,
      destination: od.destination,
      picks_drops: get(l, "Picks/Drops") || null,
      pickup_date: isoDay(get(l, "Pickup"), "Pickup", first),
      delivery_date: isoDay(get(l, "Delivery"), "Delivery", first),
      driver_name: get(l, "Driver").replace(/^Primary:\s*/i, "").trim(),
      truck_number: get(l, "Truck#").replace(/-Own$/i, "").trim(),
      trailer_number: trailerNo?.trim() || null,
      trailer_type: trailerRest.join(" - ").trim() || null,
      at_status: get(l, "Status"),
      st_miles: num(get(l, "St. Miles")),
      l_miles: num(get(l, "L.Miles")),
      e_miles: num(get(l, "E.Miles")),
      driver_pay: num(get(l, "Driver Pay")),
      driver_rpm: num(get(l, "Driver R.P.M")),
      charges_cents: cents(get(l, "Charges")),
      qp_cents: cents(get(l, "QP")),
      total_cents: cents(get(l, "Total")),
    });
  }
  if (totals.count != null && totals.count !== rows.length) {
    throw new LoadHistoryParseError("totals_count_mismatch", `The export's Totals line says ${totals.count} loads; ${rows.length} were read.`);
  }
  const sum = rows.reduce((a, r) => a + r.charges_cents, 0);
  if (totals.charges_cents != null && totals.charges_cents !== sum) {
    throw new LoadHistoryParseError("totals_charges_mismatch", `The export's Totals Charges is ${totals.charges_cents}c; the rows sum to ${sum}c.`);
  }
  return { title, range_label, invoiced_by, rows, totals };
}

/** What a row books as. Completed -> booked then delivered; Dispatched -> booked dispatched; anything else -> not booked. */
export type LoadHistoryDisposition = "deliver" | "dispatch" | "not_booked";

export function dispositionFor(atStatus: string): LoadHistoryDisposition {
  const s = atStatus.trim().toLowerCase();
  if (s === "completed" || s === "delivered") return "deliver";
  if (s === "dispatched" || s === "in transit" || s === "loading" || s === "unloading") return "dispatch";
  return "not_booked";
}

/** Short (pay) miles = AlwaysTrack Driver Pay / Driver R.P.M (the miles AT paid). Null when the export carries no per-mile pay. */
export function payMiles(row: Pick<AlwaysTrackLoadHistoryRow, "driver_pay" | "driver_rpm">): number | null {
  const pay = Number(row.driver_pay ?? 0);
  const rpm = Number(row.driver_rpm ?? 0);
  if (!(pay > 0) || !(rpm > 0)) return null;
  return Math.round((pay / rpm) * 10) / 10;
}

/**
 * ACCT-F11108 part 2 (measured on the owner's real export, 2026-11-09: 18 of 35 loads refused on the mdata.loads CHECK
 * loads_miles_shortest_not_over_practical). AlwaysTrack's Driver Pay / Driver R.P.M is the miles of the WHOLE trip AT paid —
 * loaded AND empty (13701: 657.7 paid = 520.3 loaded + 137.4 E.Miles; its L.Miles is 544.9). The app pays
 * (miles_shortest x loaded rate) + (miles_deadhead x empty rate) (owner MILES SPEC 2026-09-02), so the E.Miles part is
 * miles_deadhead and only the rest is short loaded miles — the same total pay to the cent, the empty leg never folded into
 * miles_shortest. Null when the export carries no per-mile pay.
 */
export function emptyPayMiles(row: Pick<AlwaysTrackLoadHistoryRow, "driver_pay" | "driver_rpm" | "e_miles">): number | null {
  if (payMiles(row) == null) return null;
  const e = Number(row.e_miles ?? 0);
  return e > 0 ? Math.round(e * 10) / 10 : null;
}

/** Short LOADED pay miles = AT's paid miles less the E.Miles it paid as empty. */
export function loadedPayMiles(row: Pick<AlwaysTrackLoadHistoryRow, "driver_pay" | "driver_rpm" | "e_miles">): number | null {
  const paid = payMiles(row);
  if (paid == null) return null;
  return Math.round((paid - (emptyPayMiles(row) ?? 0)) * 10) / 10;
}

/** Practical miles = the export's L.Miles; a 0 / blank figure is no figure. */
export function practicalMiles(row: Pick<AlwaysTrackLoadHistoryRow, "l_miles">): number | null {
  const v = Number(row.l_miles ?? 0);
  return v > 0 ? Math.round(v * 10) / 10 : null;
}

export function isLocalMove(row: Pick<AlwaysTrackLoadHistoryRow, "origin" | "destination">): boolean {
  return (
    row.origin.city.toLowerCase() === row.destination.city.toLowerCase() &&
    row.origin.state === row.destination.state
  );
}

/** Mexican state codes AlwaysTrack prints ("Nuevo Laredo, Tam."): such a stop is in MX, every other stop in the US. */
const MX_STATES = new Set(["AGS", "BC", "BCS", "CAM", "CHIS", "CHIH", "CDMX", "COAH", "COL", "DGO", "GTO", "GRO", "HGO", "JAL", "MEX", "MICH", "MOR", "NAY", "NL", "OAX", "PUE", "QRO", "QROO", "SLP", "SIN", "SON", "TAB", "TAM", "TAMPS", "TLAX", "VER", "YUC", "ZAC"]);
export function stopCountry(state: string): "MX" | "US" {
  return MX_STATES.has(state.toUpperCase().replace(/[^A-Z]/g, "")) ? "MX" : "US";
}

/** Driver name match key: letters only, lower case ("HUGO GAYTAN SARABIA" -> "hugogaytansarabia"). */
export function driverKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
