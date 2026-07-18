import ExcelJS from "exceljs";
import { addArrayWorksheet, writeWorkbookBuffer } from "../lib/exceljs-workbook.js";

export async function renderStatementXlsx(input: {
  sheetName: string;
  rows: Array<Array<string | number>>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addArrayWorksheet(workbook, input.sheetName, input.rows);
  return writeWorkbookBuffer(workbook);
}
