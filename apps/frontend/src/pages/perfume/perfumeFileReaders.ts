/**
 * PERFUME-DESK — reads a vendor's price list in the browser (the original file never leaves the
 * owner's machine except as parsed rows). Excel (.xlsx/.xls) and CSV through SheetJS; text PDFs
 * (La Esperanza / Clásica style "NAME ..... $55.50" in two columns) through pdf.js.
 *
 * The import check: the reader also totals EVERY price it sees in the file independently of which
 * rows it keeps. The server refuses the list unless its saved total equals that file total to the cent.
 */
import type { PerfumeImportRow } from "../../api/perfume";

export type Field = "code" | "sku" | "upc" | "brand" | "desc" | "size" | "type" | "gender" | "section" | "price" | "qty" | "case_pack";
export const FIELDS: Array<[Field, string]> = [
  ["sku", "SKU / item #"], ["upc", "UPC / barcode"], ["brand", "Brand"], ["desc", "Description / name"], ["size", "Size"],
  ["type", "Type (EDT/EDP)"], ["gender", "Gender"], ["section", "Department / section"], ["price", "Price"], ["qty", "Qty available"],
  ["case_pack", "Box / case qty"],
];
export type Mapping = Partial<Record<Field, number>>;
export type Sheet = { name: string; cells: Array<Array<string | number | null>> };
export type ReadFile = { kind: "xlsx" | "xls" | "csv" | "pdf_text"; sheets: Sheet[] };

const GUESS: Record<Field, RegExp[]> = {
  upc: [/upc/, /ean/, /barcode/, /gtin/, /c[oó]digo de barras/],
  code: [/internal/, /interno/],
  sku: [/\bsku\b/, /^item$/, /item\s*(#|no|code|number)/, /\bref\b|referencia/, /\bcode\b|c[oó]digo/, /model|style|part/],
  brand: [/brand/, /marca/, /designer/, /manufacturer/, /house/],
  desc: [/desc/, /product/, /item name/, /name/, /nombre/, /art[ií]culo/, /fragrance/],
  size: [/^size$/, /tama[nñ]o/, /volume/, /contenido/],
  type: [/^type$/, /^tipo$/, /concentration/],
  gender: [/gender/, /g[eé]nero/, /\bsex\b/],
  section: [/^dept/, /department/, /categor/, /secci[oó]n/],
  price: [/price/, /precio/, /cost/, /costo/, /wholesale/, /mayoreo/, /\bnet\b/, /\bunit\b/, /\$/],
  qty: [/qty/, /quantity/, /cantidad/, /stock/, /avail/, /inventory/, /existencia/, /on hand/],
  case_pack: [/case\s*pack/, /casepack/, /full box/, /box qty/, /master/, /\bpack\b/],
};

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  const order: Field[] = ["upc", "code", "price", "qty", "case_pack", "brand", "size", "type", "gender", "section", "sku", "desc"];
  for (const f of order) {
    for (const re of GUESS[f]) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(String(h).toLowerCase().trim()));
      if (i >= 0) { m[f] = i; used.add(i); break; }
    }
  }
  return m;
}

/** The header row: the first row (of the first 30) with 3+ text labels. */
export function findHeaderRow(cells: Sheet["cells"]): number {
  for (let i = 0; i < Math.min(30, cells.length); i++) {
    const labels = (cells[i] ?? []).map((c) => String(c ?? "").trim()).filter((c) => c && /[a-zA-Z]/.test(c) && !/^\$?\d/.test(c));
    if (labels.length >= 3) return i;
  }
  return 0;
}

/** A price as the file shows it → cents, or null. Same rule as the server (string math). */
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

export type Extracted = { rows: PerfumeImportRow[]; rowsRead: number; fileTotalCents: number; sections: number };

/**
 * Rows from a sheet. A line with text but no price is a SECTION header ("WOMEN", "SETS MEN", "100.Regular");
 * the lines under it carry it. rowsRead counts every data line (sections and blanks excluded).
 */
export function extractRows(sheet: Sheet, headerRow: number, map: Mapping): Extracted {
  const rows: PerfumeImportRow[] = [];
  let section = "";
  let rowsRead = 0, total = 0, sections = 0;
  const get = (r: Sheet["cells"][number], f: Field) => (map[f] == null ? null : r[map[f]!]);
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
      sheet: sheet.name, row_no: i + 1,
      upc: cellText(get(r, "upc")) || null, sku: cellText(get(r, "sku")) || null, brand: cellText(get(r, "brand")) || null,
      description: cellText(get(r, "desc")), size_text: cellText(get(r, "size")) || null, type: cellText(get(r, "type")) || null,
      gender: cellText(get(r, "gender")) || null, section: cellText(get(r, "section")) || section || null,
      price: (priceCents / 100).toFixed(2), qty: cellText(get(r, "qty")) || null, case_pack: cellText(get(r, "case_pack")) || null,
      raw: Object.fromEntries(r.map((c, k) => [k, c])),
    });
  }
  return { rows, rowsRead, fileTotalCents: total, sections };
}

export async function readSpreadsheet(file: File): Promise<ReadFile> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const kind = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xls") ? "xls" : "xlsx";
  return {
    kind,
    sheets: wb.SheetNames.map((name) => ({
      name,
      cells: XLSX.utils.sheet_to_json<Array<string | number | null>>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
    })),
  };
}

/**
 * Text PDF → one sheet of [description, price] pairs. Lines are rebuilt from text positions; each line can
 * hold several "NAME $00.00" pairs (two-column lists). Lines with no price become section headers.
 */
export const PDF_NO_NAME = "(no name on this line in the file)";
/**
 * Every "$00.00" on a PDF text line becomes one [name, price] pair — including a price printed with no name
 * (LISTA N 5 has one), so the file total counts every price the file shows and the nameless line lands in
 * Review instead of vanishing.
 */
export function pdfLinePairs(line: string): Array<[string, string]> {
  return [...line.matchAll(/((?:\S.*?)?)\s*\$\s?([\d,]+\.\d{2})/g)].map((m) => [m[1].trim() || PDF_NO_NAME, m[2].replace(/,/g, "")]);
}

export async function readPdf(file: File): Promise<ReadFile> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const cells: Sheet["cells"] = [["DESCRIPCION", "PRECIO"]];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of content.items as Array<{ str: string; transform: number[] }>) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      (byY.get(key) ?? byY.set(key, []).get(key)!).push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const line = byY.get(y)!.sort((a, b) => a.x - b.x).map((t) => t.s).join(" ").replace(/\s+/g, " ").trim();
      const pairs = pdfLinePairs(line);
      if (pairs.length) for (const pr of pairs) cells.push(pr);
      else if (line.length <= 40 && /^[A-ZÁÉÍÓÚÑ &/'-]+$/i.test(line)) cells.push([line, null]);
    }
  }
  return { kind: "pdf_text", sheets: [{ name: file.name, cells }] };
}

export async function readAnyFile(file: File): Promise<ReadFile> {
  return file.name.toLowerCase().endsWith(".pdf") ? readPdf(file) : readSpreadsheet(file);
}
