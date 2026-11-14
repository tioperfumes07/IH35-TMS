/**
 * PERFUME-DESK — reads a vendor's price list in the browser (the original file never leaves the
 * owner's machine except as parsed rows). Excel (.xlsx/.xls) and CSV through SheetJS; text PDFs
 * (La Esperanza / Clásica style "NAME ..... $55.50" in two columns) through pdf.js.
 *
 * The import check: the reader also totals EVERY price it sees in the file independently of which
 * rows it keeps. The server refuses the list unless its saved total equals that file total to the cent.
 */
import type { PerfumeExtractedLine, PerfumeImportRow, PerfumePicture } from "../../api/perfume";

export type Field = "code" | "sku" | "upc" | "brand" | "desc" | "size" | "type" | "gender" | "section" | "price" | "qty" | "case_pack"
  | "purchase_date" | "qty_purchased" | "qty_sold";
export const FIELDS: Array<[Field, string]> = [
  ["sku", "SKU / item #"], ["upc", "UPC / barcode"], ["brand", "Brand"], ["desc", "Description / name"], ["size", "Size"],
  ["type", "Type (EDT/EDP)"], ["gender", "Gender"], ["section", "Department / section"], ["price", "Price"], ["qty", "Qty available"],
  ["case_pack", "Box / case qty"],
  // My inventory file (owner 2026-11-14): last purchase date, how many I bought, how many I sold.
  ["purchase_date", "Purchase date"], ["qty_purchased", "Qty purchased"], ["qty_sold", "Qty sold"],
];
export type Mapping = Partial<Record<Field, number>>;
export type Sheet = { name: string; cells: Array<Array<string | number | null>> };
/** "image" = offer photos or a scanned PDF (no text layer): the pictures are read by Claude, then approved. */
export type ReadFile = { kind: "xlsx" | "xls" | "csv" | "pdf_text" | "image"; sheets: Sheet[]; pictures?: PerfumePicture[] };

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

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  const order: Field[] = ["upc", "code", "purchase_date", "qty_purchased", "qty_sold", "price", "case_pack", "qty", "brand", "size", "type", "gender", "section", "sku", "desc"];
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
/** keepPriceless: the owner's OWN lists (offer / inventory) — a line naming an item but carrying no price is still an
 *  item he holds (owner 2026-11-14: 582 lines, 2 without a price were dropped); its price stays empty, never 0. */
export function extractRows(sheet: Sheet, headerRow: number, map: Mapping, opts: { keepPriceless?: boolean } = {}): Extracted {
  const rows: PerfumeImportRow[] = [];
  let section = "";
  let rowsRead = 0, total = 0, sections = 0;
  const get = (r: Sheet["cells"][number], f: Field) => (map[f] == null ? null : r[map[f]!]);
  for (let i = headerRow + 1; i < sheet.cells.length; i++) {
    const r = sheet.cells[i] ?? [];
    const nonEmpty = r.filter((c) => String(c ?? "").trim() !== "");
    if (!nonEmpty.length) continue;
    const priceCents = priceToCents(get(r, "price"));
    const namesItem = Boolean(cellText(get(r, "desc")) || cellText(get(r, "upc")) || cellText(get(r, "sku")));
    if (priceCents == null && !(opts.keepPriceless && namesItem && nonEmpty.length > 2)) {
      if (nonEmpty.length <= 2) { section = nonEmpty.map(cellText).join(" "); sections++; }
      continue;
    }
    rowsRead++;
    total += priceCents ?? 0;
    rows.push({
      sheet: sheet.name, row_no: i + 1,
      upc: cellText(get(r, "upc")) || null, sku: cellText(get(r, "sku")) || null, brand: cellText(get(r, "brand")) || null,
      description: cellText(get(r, "desc")), size_text: cellText(get(r, "size")) || null, type: cellText(get(r, "type")) || null,
      gender: cellText(get(r, "gender")) || null, section: cellText(get(r, "section")) || section || null,
      price: priceCents == null ? null : (priceCents / 100).toFixed(2), qty: cellText(get(r, "qty")) || null, case_pack: cellText(get(r, "case_pack")) || null,
      purchase_date: cellText(get(r, "purchase_date")) || null, qty_purchased: cellText(get(r, "qty_purchased")) || null, qty_sold: cellText(get(r, "qty_sold")) || null,
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

export const PICTURE_MAX_SIDE = 1600;
export const isPictureFile = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);

function canvasToPicture(canvas: HTMLCanvasElement, name: string): PerfumePicture {
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { name, media_type: "image/jpeg", data_base64: url.slice(url.indexOf(",") + 1) };
}

/** Shrink a photo to <= 1600 px on its long side as JPEG (keeps prices readable, keeps each call small). */
export async function pictureFromFile(file: File, maxSide = PICTURE_MAX_SIDE): Promise<PerfumePicture> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this browser cannot open that picture type (HEIC/HEIF photos: share them as JPEG)`);
  }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvasToPicture(canvas, file.name);
}

/** A scanned PDF has no text layer: render every page to a picture for the reader. */
export async function picturesFromPdf(file: File, maxSide = 1800): Promise<PerfumePicture[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PerfumePicture[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, maxSide / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    out.push(canvasToPicture(canvas, `${file.name} · page ${p}`));
  }
  return out;
}

/** True when a PDF read gave no priced line at all — it is a scan (pictures of pages), not a text PDF. */
export function pdfHasNoText(r: ReadFile): boolean {
  return !(r.sheets[0]?.cells ?? []).slice(1).some((c) => c[1] != null && c[1] !== "");
}

export async function readAnyFile(file: File): Promise<ReadFile> {
  if (isPictureFile(file)) return { kind: "image", sheets: [], pictures: [await pictureFromFile(file)] };
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const r = await readPdf(file);
    return pdfHasNoText(r) ? { kind: "image", sheets: [], pictures: await picturesFromPdf(file) } : r;
  }
  return readSpreadsheet(file);
}

/** Several offer photos at once → one picture list (a spreadsheet or text PDF is always one file). */
export async function readPictureFiles(files: File[]): Promise<ReadFile> {
  const pictures: PerfumePicture[] = [];
  for (const f of files) {
    if (isPictureFile(f)) pictures.push(await pictureFromFile(f));
    else if (f.name.toLowerCase().endsWith(".pdf")) pictures.push(...(await picturesFromPdf(f)));
    else throw new Error(`${f.name}: pick pictures and PDFs together, or one spreadsheet on its own`);
  }
  return { kind: "image", sheets: [], pictures };
}

/** Approved picture lines → import rows. The approved lines ARE the file total for the to-the-cent check. */
export type PictureLine = PerfumeExtractedLine & { key: string; include: boolean };
export function pictureLinesToExtracted(lines: PictureLine[]): Extracted {
  const rows: PerfumeImportRow[] = [];
  let total = 0;
  for (const l of lines) {
    if (!l.include) continue;
    const cents = priceToCents(l.price ?? "");
    if (cents == null || cents <= 0 || !l.description.trim()) continue;
    total += cents;
    rows.push({
      sheet: l.image_name.slice(0, 120) || null, row_no: rows.length + 1, brand: l.brand?.trim() || null, description: l.description.trim().slice(0, 400),
      size_text: l.size?.slice(0, 60) || null, type: l.type?.slice(0, 40) || null, gender: l.gender?.slice(0, 30) || null,
      section: l.section?.slice(0, 120) || null, price: (cents / 100).toFixed(2), qty: l.qty?.slice(0, 30) || null,
      raw: { image: l.image, image_name: l.image_name, note: l.note },
    });
  }
  return { rows, rowsRead: rows.length, fileTotalCents: total, sections: 0 };
}
