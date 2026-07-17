import { describe, expect, it } from "vitest";
import {
  assertSpreadsheetMagicBytes,
  parseSpreadsheetBufferSafe,
  SpreadsheetParseError,
} from "./safe-spreadsheet-parse.js";
import ExcelJS from "exceljs";

describe("safe-spreadsheet-parse", () => {
  it("rejects non-ZIP bytes labeled .xlsx", () => {
    expect(() => assertSpreadsheetMagicBytes(Buffer.from("not-a-zip"), "prices.xlsx")).toThrow(
      SpreadsheetParseError
    );
  });

  it("rejects binary masquerading as csv", () => {
    expect(() => assertSpreadsheetMagicBytes(Buffer.from([0, 1, 2, 3, 4]), "card.csv")).toThrow(
      SpreadsheetParseError
    );
  });

  it("rejects legacy .xls rather than falling back to SheetJS", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(() => assertSpreadsheetMagicBytes(ole, "legacy.xls")).toThrow(/xls_legacy_unsupported/);
  });

  it("parses csv rows", async () => {
    const rows = await parseSpreadsheetBufferSafe(
      Buffer.from("station_name,price\nLove's Austin,3.45\n", "utf8"),
      "prices.csv"
    );
    expect(rows).toEqual([{ station_name: "Love's Austin", price: "3.45" }]);
  });

  it("parses xlsx via exceljs after magic-byte gate", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Sheet1");
    sheet.addRow(["station_name", "price_per_gallon"]);
    sheet.addRow(["Love's HQ", 3.21]);
    const ab = await wb.xlsx.writeBuffer();
    const buf = Buffer.from(ab);
    expect(assertSpreadsheetMagicBytes(buf, "loves.xlsx")).toBe("xlsx");
    const rows = await parseSpreadsheetBufferSafe(buf, "loves.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ station_name: "Love's HQ", price_per_gallon: 3.21 });
  });
});
