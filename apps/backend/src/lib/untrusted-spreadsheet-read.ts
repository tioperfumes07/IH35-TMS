/**
 * Single gate for parsing untrusted spreadsheet uploads.
 *
 * - .xlsx: magic-byte ZIP check, then ExcelJS.
 * - .csv: text validation, then the local RFC 4180-compatible parser below.
 * - .xls: rejected by the byte gate; inert document storage is unaffected.
 */
import ExcelJS from "exceljs";
import { DateTime } from "luxon";
import {
  SpreadsheetUploadRejectedError,
  validateSpreadsheetUploadBytes,
} from "./spreadsheet-upload-bytes.js";
import { COMPANY_TIME_ZONE } from "./company-business-date.js";

export { SpreadsheetUploadRejectedError };

function worksheetToRows(
  worksheet: ExcelJS.Worksheet,
  cellDates: boolean,
  date1904: boolean
): Record<string, unknown>[] {
  const rawHeaders: unknown[] = [];
  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(headerRow.cellCount, worksheet.columnCount);
  for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
    rawHeaders[colNumber - 1] = excelCellValue(
      headerRow.getCell(colNumber).value,
      cellDates,
      date1904
    );
  }
  const headers = normalizeHeaders(rawHeaders);

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const mapped: Record<string, unknown> = {};
    headers.forEach((key, index) => {
      mapped[key] = excelCellValue(row.getCell(index + 1).value, cellDates, date1904);
    });
    rows.push(mapped);
  });
  return rows;
}

function excelCellValue(value: ExcelJS.CellValue, cellDates: boolean, date1904: boolean): unknown {
  if (value instanceof Date) {
    return cellDates ? excelWallClockToCompanyInstant(value) : excelDateToSerial(value, date1904);
  }
  if (value == null || typeof value !== "object") return value ?? null;
  if ("result" in value) {
    return value.result == null
      ? null
      : excelCellValue(value.result as ExcelJS.CellValue, cellDates, date1904);
  }
  if ("formula" in value || "sharedFormula" in value) return null;
  if ("text" in value || "hyperlink" in value) {
    const text = "text" in value && typeof value.text === "string" ? value.text : "";
    return text.length > 0 ? text : "hyperlink" in value ? value.hyperlink : null;
  }
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("error" in value) return value.error;
  return null;
}

function excelDateToSerial(value: Date, date1904: boolean): number {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const wallClockUtc = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds()
  );
  return (wallClockUtc - epoch) / 86_400_000;
}

function excelWallClockToCompanyInstant(value: Date): Date {
  return DateTime.fromObject(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds(),
      millisecond: value.getUTCMilliseconds(),
    },
    { zone: COMPANY_TIME_ZONE }
  ).toJSDate();
}

function readGatedCsvText(buffer: Buffer): Record<string, unknown>[] {
  let text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separatorDirective = /^sep=(.)\r?\n/i.exec(text);
  const delimiter =
    separatorDirective?.[1] ??
    [",", ";", "\t"]
      .map((candidate) => ({
        candidate,
        count: countUnquotedDelimiter(firstLine, candidate),
      }))
      .sort((left, right) => right.count - left.count)[0]?.candidate ??
    ",";
  if (separatorDirective) text = text.slice(separatorDirective[0].length);
  const parsedRows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) parsedRows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new SpreadsheetUploadRejectedError("csv_unclosed_quote", "CSV contains an unclosed quoted field");
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) parsedRows.push(row);

  const headers = normalizeHeaders((parsedRows.shift() ?? []).map(coerceLegacyCsvValue));
  return parsedRows.map((values) => {
    const mapped: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      mapped[header] = coerceLegacyCsvValue(values[index] ?? "");
    });
    return mapped;
  });
}

function normalizeHeaders(values: unknown[]): string[] {
  const usedHeaders = new Set<string>();
  const headerCounts = new Map<string, number>();
  return values.map((value) => {
    const base = value == null || value === "" ? "__EMPTY" : String(value);
    let suffix = headerCounts.get(base) ?? 0;
    let candidate = suffix === 0 ? base : `${base}_${suffix}`;
    while (usedHeaders.has(candidate)) {
      suffix += 1;
      candidate = `${base}_${suffix}`;
    }
    headerCounts.set(base, suffix + 1);
    usedHeaders.add(candidate);
    return candidate;
  });
}

/**
 * Preserve the value coercion contract of the retired SheetJS CSV path:
 * text workbook parsing followed by object rows with null defaults.
 * Controlled parity fixtures live in exceljs-spreadsheet.test.ts.
 */
function coerceLegacyCsvValue(value: string): unknown {
  if (value === "") return null;
  if (value.trim() === "") return value;
  if (value.startsWith("=")) return null;
  if (value === "TRUE") return true;
  if (value === "FALSE") return false;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return dateToLegacyExcelSerial(parsed);
  }

  return value;
}

function dateToLegacyExcelSerial(value: Date): number {
  const epoch = new Date(1899, 11, 30);
  return (
    (value.getTime() - epoch.getTime()) / 86_400_000 -
    (value.getTimezoneOffset() - epoch.getTimezoneOffset()) / 1_440
  );
}

function countUnquotedDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

export async function readUntrustedSpreadsheetRows(
  buffer: Buffer,
  filename: string,
  options?: { cellDates?: boolean }
): Promise<Record<string, unknown>[]> {
  const kind = validateSpreadsheetUploadBytes(buffer, filename);

  if (kind === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    return worksheetToRows(sheet, options?.cellDates === true, workbook.properties.date1904 === true);
  }

  if (kind === "csv") {
    return readGatedCsvText(buffer);
  }

  throw new SpreadsheetUploadRejectedError("unsupported_extension", "Unsupported spreadsheet extension");
}
