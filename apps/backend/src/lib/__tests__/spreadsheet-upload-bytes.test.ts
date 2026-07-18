import { describe, expect, it } from "vitest";
import {
  hasZipSpreadsheetMagic,
  looksLikeCsvText,
  SpreadsheetUploadRejectedError,
  validateSpreadsheetUploadBytes,
} from "../spreadsheet-upload-bytes.js";

describe("spreadsheet-upload-bytes", () => {
  it("accepts ZIP magic for .xlsx", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(hasZipSpreadsheetMagic(buf)).toBe(true);
    expect(validateSpreadsheetUploadBytes(buf, "prices.xlsx")).toBe("xlsx");
  });

  it("rejects non-ZIP content for .xlsx", () => {
    const buf = Buffer.from("not a zip file");
    expect(() => validateSpreadsheetUploadBytes(buf, "bad.xlsx")).toThrow(SpreadsheetUploadRejectedError);
    try {
      validateSpreadsheetUploadBytes(buf, "bad.xlsx");
    } catch (err) {
      expect((err as SpreadsheetUploadRejectedError).code).toBe("xlsx_magic_mismatch");
    }
  });

  it("rejects parsed legacy .xls even when OLE magic is present", () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect(() => validateSpreadsheetUploadBytes(buf, "legacy.xls")).toThrow(SpreadsheetUploadRejectedError);
    try {
      validateSpreadsheetUploadBytes(buf, "legacy.xls");
    } catch (err) {
      expect((err as SpreadsheetUploadRejectedError).code).toBe("legacy_xls_unsupported");
    }
  });

  it("accepts CSV text with delimiters", () => {
    const buf = Buffer.from("a,b\n1,2\n", "utf8");
    expect(looksLikeCsvText(buf)).toBe(true);
    expect(validateSpreadsheetUploadBytes(buf, "data.csv")).toBe("csv");
  });

  it("rejects binary content for .csv", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(() => validateSpreadsheetUploadBytes(buf, "fake.csv")).toThrow(SpreadsheetUploadRejectedError);
  });
});
