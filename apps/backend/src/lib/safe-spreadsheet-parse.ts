/**
 * Safe untrusted-spreadsheet parse (0243-h2-1 / coder-work-order-t2-3-xlsx-cve).
 *
 * SheetJS `xlsx@0.18.5` has known prototype-pollution + ReDoS on READ of attacker-
 * controlled workbooks. Upload paths MUST use this module (exceljs + magic-byte gate),
 * never raw `XLSX.read`. Residual: `xlsx` may remain for trusted WRITE/export only —
 * see docs/specs/XLSX-UPLOAD-HARDENING-2026-07-17.md.
 */
import ExcelJS from "exceljs";

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export class SpreadsheetParseError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "SpreadsheetParseError";
    this.code = code;
  }
}

export type SpreadsheetKind = "xlsx" | "csv";

/** Reject non-spreadsheet / masquerading payloads before any workbook parser runs. */
export function assertSpreadsheetMagicBytes(buffer: Buffer, filename: string): SpreadsheetKind {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_SIG)) {
      throw new SpreadsheetParseError("csv_magic_mismatch");
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_SIG)) {
      throw new SpreadsheetParseError("csv_magic_mismatch");
    }
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    if (sample.includes(0)) {
      throw new SpreadsheetParseError("csv_binary_rejected");
    }
    return "csv";
  }

  if (lower.endsWith(".xlsx")) {
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_SIG)) {
      throw new SpreadsheetParseError("xlsx_magic_mismatch");
    }
    return "xlsx";
  }

  // Legacy BIFF/OLE (.xls) — exceljs does not parse it; do not fall back to vulnerable SheetJS.
  if (lower.endsWith(".xls")) {
    throw new SpreadsheetParseError("xls_legacy_unsupported");
  }

  throw new SpreadsheetParseError("unsupported_file_type");
}

function cellToJsonValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result === undefined ? null : result;
    }
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("");
    }
    if ("text" in value) return (value as ExcelJS.CellHyperlinkValue).text;
    if ("error" in value) return null;
  }
  return String(value);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsvBuffer(buffer: Buffer): Array<Record<string, unknown>> {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      if (!key) continue;
      const raw = cols[c] ?? "";
      const val = raw === "" ? null : raw;
      obj[key] = val;
      if (val !== null) any = true;
    }
    if (any) rows.push(obj);
  }
  return rows;
}

/**
 * Parse an uploaded spreadsheet into row objects (header row → keys).
 * Uses exceljs for .xlsx; RFC4180-ish CSV for .csv. Never SheetJS.
 */
export async function parseSpreadsheetBufferSafe(
  buffer: Buffer,
  filename: string
): Promise<Array<Record<string, unknown>>> {
  const kind = assertSpreadsheetMagicBytes(buffer, filename);
  if (kind === "csv") return parseCsvBuffer(buffer);

  const workbook = new ExcelJS.Workbook();
  // exceljs accepts Node Buffer at runtime; package typings are browser-oriented.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const colCount = Math.max(sheet.actualColumnCount || 0, headerRow.cellCount || 0, sheet.columnCount || 0);
  const headers: string[] = [];
  for (let c = 1; c <= colCount; c += 1) {
    const v = cellToJsonValue(headerRow.getCell(c).value);
    headers[c] = v == null || v === "" ? "" : String(v);
  }

  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = 1; c <= colCount; c += 1) {
      const key = headers[c];
      if (!key) continue;
      const val = cellToJsonValue(row.getCell(c).value);
      obj[key] = val ?? null;
      if (val !== null && val !== undefined && val !== "") any = true;
    }
    if (any) rows.push(obj);
  });
  return rows;
}
