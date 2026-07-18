import { describe, expect, it } from "vitest";
import { normalizeExcelJsCellValue } from "../exceljs-cell-value.mjs";

describe("sync-program-board ExcelJS cell normalization", () => {
  it("normalizes formula, hyperlink, rich text, error, date, and scalar values", () => {
    expect(normalizeExcelJsCellValue({ formula: "1+1", result: 2 })).toBe(2);
    expect(normalizeExcelJsCellValue({ formula: "1+1" })).toBeNull();
    expect(normalizeExcelJsCellValue({ text: "Evidence", hyperlink: "https://example.test/evidence" })).toBe(
      "Evidence"
    );
    expect(normalizeExcelJsCellValue({ hyperlink: "https://example.test/evidence", text: "" })).toBe(
      "https://example.test/evidence"
    );
    expect(normalizeExcelJsCellValue({ richText: [{ text: "Block " }, { text: "Title" }] })).toBe(
      "Block Title"
    );
    expect(normalizeExcelJsCellValue({ error: "#VALUE!" })).toBe("#VALUE!");
    expect(normalizeExcelJsCellValue(new Date("2026-07-17T12:34:56.000Z"))).toBe(
      "2026-07-17T12:34:56.000Z"
    );
    expect(normalizeExcelJsCellValue("ID-001")).toBe("ID-001");
    expect(normalizeExcelJsCellValue(42)).toBe(42);
    expect(normalizeExcelJsCellValue(true)).toBe(true);
    expect(normalizeExcelJsCellValue({ unexpected: "object" })).toBeNull();
  });
});
