import * as XLSX from "xlsx";

export function renderStatementXlsx(input: {
  sheetName: string;
  rows: Array<Array<string | number>>;
}): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(input.rows);
  XLSX.utils.book_append_sheet(workbook, sheet, input.sheetName);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}
