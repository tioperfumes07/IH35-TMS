/**
 * Single gate for parsing untrusted spreadsheet uploads.
 *
 * - .xlsx: magic-byte ZIP check, then exceljs (maintained; avoids xlsx@0.18.5 CVE surface on XLSX).
 * - .csv / .xls: magic-byte check, then xlsx@0.18.5 (residual CVE — no patched SheetJS on npm).
 *   See docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md §0091-h2-1 residual note.
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  SpreadsheetUploadRejectedError,
  validateSpreadsheetUploadBytes,
} from "./spreadsheet-upload-bytes.js";

export { SpreadsheetUploadRejectedError };

function worksheetToRows(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.value == null ? "" : String(cell.value);
  });

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const mapped: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber - 1];
      if (!key) return;
      mapped[key] = cell.value ?? null;
    });
    rows.push(mapped);
  });
  return rows;
}

function readGatedXlsxBuffer(buffer: Buffer, cellDates?: boolean): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: !!cellDates });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
}

function readGatedCsvText(buffer: Buffer): Record<string, unknown>[] {
  const text = buffer.toString("utf8");
  const wb = XLSX.read(text, { type: "string" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
}

export async function readUntrustedSpreadsheetRows(
  buffer: Buffer,
  filename: string,
  options?: { cellDates?: boolean }
): Promise<Record<string, unknown>[]> {
  const kind = validateSpreadsheetUploadBytes(buffer, filename);

  if (kind === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    return worksheetToRows(sheet);
  }

  if (kind === "csv") {
    return readGatedCsvText(buffer);
  }

  return readGatedXlsxBuffer(buffer, options?.cellDates);
}
