import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildBankingTransactionsXlsx } from "./banking-transactions-xlsx";

describe("banking transactions XLSX export", () => {
  it("creates an openable workbook instead of CSV bytes mislabeled as .xls", async () => {
    const buffer = await buildBankingTransactionsXlsx([
      ["Date", "Description", "Spent", "Received", "Balance"],
      ["2026-07-17", "Fuel, tolls", 125.5, "", -25.05],
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.getWorksheet("Banking Transactions");
    expect(sheet?.getCell("A1").value).toBe("Date");
    expect(sheet?.getCell("B2").value).toBe("Fuel, tolls");
    expect(sheet?.getCell("C2").value).toBe(125.5);
    expect(sheet?.getCell("D2").value).toBe("");
    expect(sheet?.getCell("E2").value).toBe(-25.05);
    expect(sheet?.getCell("C2").numFmt).toBe('$#,##0.00;[Red]-$#,##0.00');
    expect(sheet?.getCell("E2").numFmt).toBe('$#,##0.00;[Red]-$#,##0.00');
  });
});
