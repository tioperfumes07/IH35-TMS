import ExcelJS from "exceljs";

const INVALID_SHEET_NAME_CHARS = /[\\/?*:[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export function safeWorksheetName(name: string, fallback = "Sheet"): string {
  const sanitized = name.replace(INVALID_SHEET_NAME_CHARS, "_").trim() || fallback;
  return sanitized.slice(0, MAX_SHEET_NAME_LENGTH);
}

export function uniqueWorksheetName(workbook: ExcelJS.Workbook, name: string): string {
  const preferred = safeWorksheetName(name);
  const existing = new Set(workbook.worksheets.map((worksheet) => worksheet.name.toLowerCase()));
  if (!existing.has(preferred.toLowerCase())) return preferred;

  for (let index = 2; ; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${preferred.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
}

export function addArrayWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: SpreadsheetCell[][]
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(uniqueWorksheetName(workbook, name));
  for (const row of rows) worksheet.addRow(row);
  return worksheet;
}

export function addObjectWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: Array<Record<string, unknown>>
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(uniqueWorksheetName(workbook, name));
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) return worksheet;
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(headers.map((header) => normalizeCellValue(row[header])));
  }
  return worksheet;
}

function normalizeCellValue(value: unknown): SpreadsheetCell {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}

export async function writeWorkbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
