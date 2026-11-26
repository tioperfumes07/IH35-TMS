/**
 * PERFUME mail engine — reads a price-list attachment ON THE SERVER, the same way the Lists tab reads it in the browser
 * (apps/frontend/src/pages/perfume/perfumeFileReaders.ts): the header row, the column guess, the price → cents rule,
 * the section lines and the PDF "NAME ..... $55.50" pairs are the same rules, so a list saved by mail and the same list
 * saved by hand give the same lines and the same to-the-cent file total. readers.test.ts holds both to that.
 *
 * Excel (.xlsx) through exceljs, CSV through a quote-aware splitter, text PDFs through pdf.js (legacy Node build).
 * An old binary .xls, a scanned PDF (no text layer) or a file with no price column is NOT guessed: the engine holds it
 * with the reason and the owner opens it on the Lists tab.
 */
import ExcelJS from "exceljs";

export type Field = "code" | "sku" | "upc" | "brand" | "desc" | "size" | "type" | "gender" | "section" | "price" | "qty" | "case_pack"
  | "purchase_date" | "qty_purchased" | "qty_sold";
export type Mapping = Partial<Record<Field, number>>;
export type Cell = string | number | null;
export type Sheet = { name: string; cells: Cell[][] };
export type ReadKind = "xlsx" | "xls" | "csv" | "pdf_text";
export type ReadFile = { kind: ReadKind; sheets: Sheet[] };

export type ImportRow = {
  sheet: string | null; row_no: number; upc: string | null; sku: string | null; brand: string | null; description: string;
  size_text: string | null; type: string | null; gender: string | null; section: string | null; price: string | null;
  qty: string | null; case_pack: string | null; raw: Record<string, unknown>;
};
export type Extracted = { rows: ImportRow[]; rowsRead: number; fileTotalCents: number; sections: number };

/** Why a file is not read — the engine holds the file with this reason. */
export class UnreadableFileError extends Error {
  constructor(public readonly reason: "old_xls" | "scanned_pdf" | "unsupported_type" | "unreadable", message: string) { super(message); }
}

const GUESS: Record<Field, RegExp[]> = {
  upc: [/upc/, /ean/, /barcode/, /gtin/, /c[oó]digo de barras/],
  code: [/internal/, /interno/],
  sku: [/\bsku\b/, /^item$/, /item\s*(#|no|code|number)/, /\bref\b|referencia/, /\bcode\b|c[oó]digo/, /model|style|part/],
  brand: [/brand/, /marca/, /designer/, /manufacturer/, /house/, /product\s*line/, /^line$/],
  desc: [/desc/, /product/, /item name/, /name/, /nombre/, /art[ií]culo/, /fragrance/],
  size: [/^size$/, /tama[nñ]o/, /volume/, /contenido/],
  type: [/^type$/, /^tipo$/, /concentration/],
  gender: [/gender/, /g[eé]nero/, /\bsex\b/, /item\s*type/],
  section: [/^dept/, /department/, /categor/, /secci[oó]n/],
  price: [/price/, /precio/, /cost/, /costo/, /wholesale/, /\bwhs\b/, /^special$/, /mayoreo/, /\bnet\b/, /\bunit\b/, /\$/],
  qty: [/qty/, /quantity/, /cantidad/, /stock/, /avail/, /inventory/, /existencia/, /on hand/],
  case_pack: [/case\s*pack/, /casepack/, /full box/, /box qty/, /master/, /\bpack\b/],
  purchase_date: [/purch.*date/, /date.*purch/, /fecha.*compra/, /last.*date/, /^date$/, /^fecha$/],
  qty_purchased: [/qty.*purch/, /purch.*qty/, /purchased/, /cantidad.*compra/, /comprad/],
  qty_sold: [/sold/, /vendid/, /qty.*sale/, /sales.*qty/],
};
/** Same regexes and order as the browser (perfumeFileReaders.guessMapping), so both claim the same columns. The
 *  my-own-list fields (code, purchase date, qty purchased / sold) are guessed only so they take the same columns away
 *  from the others as in the browser; a vendor list never saves them. */
const GUESS_ORDER: Field[] = ["upc", "code", "purchase_date", "qty_purchased", "qty_sold", "price", "case_pack", "qty", "brand", "size", "type", "gender", "section", "sku", "desc"];
const SAVED_FIELDS: Field[] = ["upc", "sku", "brand", "desc", "size", "type", "gender", "section", "price", "qty", "case_pack"];

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  for (const f of GUESS_ORDER) {
    for (const re of GUESS[f]) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(String(h).toLowerCase().trim()));
      if (i >= 0) { m[f] = i; used.add(i); break; }
    }
  }
  return m;
}

/** The header row: the first row (of the first 30) with 3+ text labels. */
export function findHeaderRow(cells: Cell[][]): number {
  for (let i = 0; i < Math.min(30, cells.length); i++) {
    const labels = (cells[i] ?? []).map((c) => String(c ?? "").trim()).filter((c) => c && /[a-zA-Z]/.test(c) && !/^\$?\d/.test(c));
    if (labels.length >= 3) return i;
  }
  return 0;
}

/** A price as the file shows it → cents, or null. Same string math as the browser and the server import. */
export function priceToCents(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = (typeof v === "number" ? v.toFixed(6) : String(v)).replace(/[$,\s]/g, "").replace(/USD$/i, "");
  const m = s.match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const frac = (m[2] ?? "").padEnd(3, "0");
  let c = Number(m[1] || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) c += 1;
  return c;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) > 1e7 ? BigInt(Math.round(v)).toString() : String(v);
  return String(v).trim();
}
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const opt = (s: string, n: number) => (s ? cap(s, n) : null);

/**
 * Rows from a sheet. A line with text but no price is a SECTION header ("WOMEN", "SETS MEN"); the lines under it carry
 * it. rowsRead counts every priced line; fileTotalCents totals every price the file shows (the to-the-cent check).
 */
export function extractRows(sheet: Sheet, headerRow: number, map: Mapping): Extracted {
  const rows: ImportRow[] = [];
  let section = "";
  let rowsRead = 0, total = 0, sections = 0;
  const get = (r: Cell[], f: Field) => (map[f] == null ? null : r[map[f]!]);
  for (let i = headerRow + 1; i < sheet.cells.length; i++) {
    const r = sheet.cells[i] ?? [];
    const nonEmpty = r.filter((c) => String(c ?? "").trim() !== "");
    if (!nonEmpty.length) continue;
    const priceCents = priceToCents(get(r, "price"));
    if (priceCents == null) {
      if (nonEmpty.length <= 2) { section = nonEmpty.map(cellText).join(" "); sections++; }
      continue;
    }
    rowsRead++;
    total += priceCents;
    rows.push({
      sheet: cap(sheet.name, 120), row_no: i + 1,
      upc: opt(cellText(get(r, "upc")), 40), sku: opt(cellText(get(r, "sku")), 80), brand: opt(cellText(get(r, "brand")), 120),
      description: cap(cellText(get(r, "desc")), 400), size_text: opt(cellText(get(r, "size")), 60), type: opt(cellText(get(r, "type")), 40),
      gender: opt(cellText(get(r, "gender")), 30), section: opt(cellText(get(r, "section")) || section, 120),
      price: (priceCents / 100).toFixed(2), qty: opt(cellText(get(r, "qty")), 30), case_pack: opt(cellText(get(r, "case_pack")), 30),
      raw: Object.fromEntries(r.map((c, k) => [k, c])),
    });
  }
  return { rows, rowsRead, fileTotalCents: total, sections };
}

/**
 * A PDF line that carries gender · brand · origin · item code · name in one run (Perfume Center of America, measured
 * 2026-11-26 on PRICE-LIST-11-24-2026.pdf: "M Carolina Herrera ES I0088421 212 (M) EDT SP 1.7oz(NEW PACK"). Split it so
 * the line links like every other list: the vendor's code is the SKU, the brand is the brand, the gender is the gender,
 * and the name keeps the brand in front. A line without that shape is returned unchanged.
 */
const CODED_NAME_RE = /^([A-Z]{1,4})\s+(.+?)\s+[A-Z]{2}\s+(I\d{6,8})\s+(.+)$/;
const CODED_GENDER: Record<string, string> = { M: "Men", W: "Women", L: "Women", U: "Unisex" };
export function splitCodedRow(r: ImportRow): ImportRow {
  const m = CODED_NAME_RE.exec(r.description);
  if (!m) return r;
  const [, g, brand, code, name] = m;
  return { ...r, sku: r.sku ?? code, brand: r.brand ?? cap(brand.trim(), 120), gender: r.gender ?? CODED_GENDER[g] ?? null,
    description: cap(`${brand.trim()} ${name.trim()}`, 400) };
}

/** Every "$00.00" on a PDF text line becomes one [name, price] pair (same rule as the browser reader). */
export const PDF_NO_NAME = "(no name on this line in the file)";
export function pdfLinePairs(line: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  let end = 0;
  for (const m of line.matchAll(/((?:\S.*?)?)\s*\$\s?([\d,]+\.\d{2})/g)) {
    pairs.push([m[1].trim() || PDF_NO_NAME, m[2].replace(/,/g, "")]);
    end = (m.index ?? 0) + m[0].length;
  }
  const tail = line.slice(end).match(/^\s*([^$]*?[A-Za-z][^$]*?[^+\s])\s+([\d,]+\.\d{2})\s*$/);
  if (tail) pairs.push([tail[1].trim(), tail[2].replace(/,/g, "")]);
  return pairs;
}

/** Text lines of a PDF page set → the one [DESCRIPCION, PRECIO] sheet the browser builds. */
export function pdfLinesToSheet(name: string, lines: string[]): Sheet {
  const cells: Cell[][] = [["DESCRIPCION", "PRECIO"]];
  for (const line of lines) {
    const pairs = pdfLinePairs(line);
    if (pairs.length) for (const pr of pairs) cells.push(pr);
    else if (line.length <= 40 && /^[A-ZÁÉÍÓÚÑ &/'-]+$/i.test(line)) cells.push([line, null]);
  }
  return { name, cells };
}

export async function readPdfText(buf: Buffer, name: string): Promise<ReadFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!it.str?.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5]);
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      (byY.get(key) ?? byY.set(key, []).get(key)!).push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      lines.push(byY.get(y)!.sort((a, b) => a.x - b.x).map((t) => t.s).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  await doc.destroy();
  const sheet = pdfLinesToSheet(name, lines);
  if (!sheet.cells.slice(1).some((c) => c[1] != null && c[1] !== "")) {
    throw new UnreadableFileError("scanned_pdf", "This PDF has no text (a scan / pictures) — open it on the Lists tab, where the picture reader reads it.");
  }
  return { kind: "pdf_text", sheets: [sheet] };
}

/** One exceljs cell → the raw value SheetJS gives the browser (number stays a number; formula → its result). */
export function excelCellValue(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return excelCellValue(o.result);
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
    if ("text" in o) return excelCellValue(o.text);
    if ("error" in o) return null;
  }
  return String(v);
}

export async function readXlsx(buf: Buffer): Promise<ReadFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch (e) {
    throw new UnreadableFileError("unreadable", `Excel file could not be opened: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    const cells: Cell[][] = [];
    const width = ws.actualColumnCount || ws.columnCount;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const out: Cell[] = [];
      for (let c = 1; c <= Math.max(width, row.cellCount); c++) {
        const cell = row.getCell(c);
        // A merged range keeps its value in the top-left cell only (as SheetJS reads it).
        out.push(cell.isMerged && cell.master !== cell ? null : excelCellValue(cell.value));
      }
      while (out.length && (out[out.length - 1] == null || out[out.length - 1] === "")) out.pop();
      if (out.some((x) => x != null && String(x).trim() !== "")) cells.push(out);
    });
    sheets.push({ name: ws.name, cells });
  });
  return { kind: "xlsx", sheets };
}

/** RFC 4180 CSV (quotes, doubled quotes, commas and newlines inside quotes). Numbers stay text, as the file wrote them. */
export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => String(x ?? "").trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => String(x ?? "").trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => (x === "" ? null : x)));
}

/** The OLE2 compound-file signature every real binary .xls starts with (D0 CF 11 E0 A1 B1 1A E1). */
export const OLE_XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
export function isOleXls(buf: Buffer): boolean {
  return buf.length >= OLE_XLS_MAGIC.length && buf.subarray(0, OLE_XLS_MAGIC.length).equals(OLE_XLS_MAGIC);
}

export const PRICE_FILE_EXT = /\.(xlsx|xlsm|xls|csv|pdf)$/i;

export async function readPriceFile(buf: Buffer, fileName: string): Promise<ReadFile> {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return readPdfText(buf, fileName);
  if (n.endsWith(".csv")) return { kind: "csv", sheets: [{ name: fileName, cells: parseCsv(buf.toString("utf8")) }] };
  if (n.endsWith(".xls")) {
    throw new UnreadableFileError("old_xls", "Old Excel format (.xls) — open it on the Lists tab (or ask the vendor for .xlsx).");
  }
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return readXlsx(buf);
  throw new UnreadableFileError("unsupported_type", `Not a price-list file type: ${fileName}`);
}

/** The saved column map of a vendor (written by the Lists tab when the owner saves a list): header TEXT per field. */
export type SavedColumns = { sheet?: string | null; fields: Partial<Record<Field, string>> };
const normHeader = (h: unknown) => String(h ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function savedColumnsOf(columnMapping: Record<string, unknown> | null | undefined): SavedColumns | null {
  const m = columnMapping?.mail_columns as { sheet?: unknown; fields?: unknown } | undefined;
  if (!m || typeof m !== "object" || !m.fields || typeof m.fields !== "object") return null;
  const fields: Partial<Record<Field, string>> = {};
  for (const [k, v] of Object.entries(m.fields as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() && (SAVED_FIELDS as string[]).includes(k)) fields[k as Field] = v;
  }
  if (!fields.price || !fields.desc) return null;
  return { sheet: typeof m.sheet === "string" ? m.sheet : null, fields };
}

/** Saved columns → a mapping on THIS file: the first of the top 30 rows that carries every saved header text. */
export function applySavedColumns(sheet: Sheet, saved: SavedColumns): { headerRow: number; map: Mapping } | null {
  const want = Object.entries(saved.fields) as Array<[Field, string]>;
  for (let i = 0; i < Math.min(30, sheet.cells.length); i++) {
    const hdr = (sheet.cells[i] ?? []).map(normHeader);
    const map: Mapping = {};
    let ok = true;
    for (const [f, text] of want) {
      const ix = hdr.indexOf(normHeader(text));
      if (ix < 0) { ok = false; break; }
      map[f] = ix;
    }
    if (ok) return { headerRow: i, map };
  }
  return null;
}

export type Choice = { sheet: Sheet; headerRow: number; map: Mapping; extracted: Extracted; how: "saved_columns" | "guessed" | "pdf" };

/**
 * Which sheet, header row and columns to read. The vendor's saved columns first (the ones the owner picked by hand last
 * time); otherwise the same guess the Lists tab makes, on every sheet, keeping the sheet with the most priced lines.
 * Null when no sheet has both a description and a price column — the engine holds the file, it never guesses further.
 */
export function chooseReading(file: ReadFile, saved: SavedColumns | null): Choice | null {
  if (file.kind === "pdf_text") {
    const sheet = file.sheets[0];
    const map: Mapping = { desc: 0, price: 1 };
    const extracted = extractRows(sheet, 0, map);
    return { sheet, headerRow: 0, map, extracted: { ...extracted, rows: extracted.rows.map(splitCodedRow) }, how: "pdf" };
  }
  if (saved) {
    const pool = saved.sheet ? [...file.sheets.filter((s) => s.name === saved.sheet), ...file.sheets.filter((s) => s.name !== saved.sheet)] : file.sheets;
    for (const sheet of pool) {
      const hit = applySavedColumns(sheet, saved);
      if (hit) {
        const extracted = extractRows(sheet, hit.headerRow, hit.map);
        if (extracted.rowsRead > 0) return { sheet, ...hit, extracted, how: "saved_columns" };
      }
    }
  }
  let best: Choice | null = null;
  for (const sheet of file.sheets) {
    if (sheet.cells.length < 2) continue;
    const headerRow = findHeaderRow(sheet.cells);
    const map = guessMapping((sheet.cells[headerRow] ?? []).map((h) => String(h ?? "")));
    if (map.price == null || map.desc == null) continue;
    const extracted = extractRows(sheet, headerRow, map);
    if (extracted.rowsRead > 0 && (!best || extracted.rowsRead > best.extracted.rowsRead)) best = { sheet, headerRow, map, extracted, how: "guessed" };
  }
  return best;
}

/** A supplement (new arrivals, specials, Black Friday) is kept NEXT TO the vendor's list, never replacing it —
 *  the Lists tab's file-name rule, plus Black Friday / closeout (owner 2026-11-23: the Black Friday list sits next to PPW). */
export const SPECIAL_LIST_RE = /arrival|nuevo|new[-_ ]|special|promo|oferta|addend|supplement|black\s*friday|closeout|clearance|liquidaci/i;

/** A file or subject that names the vendor's FULL list. PCA mails "PRICE-LIST-11-25-2026.pdf" under the subject
 *  "PERFUME CENTER OF AMERICA … NEW ARRIVALS & PRICE LIST", Euro "Updated Stock List With All New Arrivals": the
 *  words "new arrivals" ride along on the full list, so a full-list name always wins (owner 2026-11-26 15:26 CT:
 *  "most should be replaced by the newest one"). */
export const FULL_LIST_RE = /price[-_ ]?list|stock[-_ ]?list|lista\s*(de\s*)?precios?|all[-_ ]brands|full[-_ ]list|complete[-_ ]list/i;

/** Special (kept next to the vendor's list)? The file name decides first: a full-list name is never special, a
 *  special name ("BLACK FRIDAY.xlsx") always is. Only a neutral file name falls back to the subject, and a subject
 *  that also names the full list ("… NEW ARRIVALS & PRICE LIST") is the full list. */
export function isSpecialList(fileName: string, subject: string | null | undefined): boolean {
  if (FULL_LIST_RE.test(fileName)) return false;
  if (SPECIAL_LIST_RE.test(fileName)) return true;
  const subj = subject ?? "";
  return SPECIAL_LIST_RE.test(subj) && !FULL_LIST_RE.test(subj);
}
