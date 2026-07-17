/**
 * Magic-byte validation for untrusted spreadsheet uploads (0091-h2-1 / 0243-h2-1).
 * Extension checks alone are insufficient — reject content that does not match the declared type.
 */

export class SpreadsheetUploadRejectedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SpreadsheetUploadRejectedError";
    this.code = code;
  }
}

const ZIP_MAGIC_PK34 = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_MAGIC_PK56 = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_MAGIC_PK78 = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function hasZipSpreadsheetMagic(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const head = buffer.subarray(0, 4);
  return head.equals(ZIP_MAGIC_PK34) || head.equals(ZIP_MAGIC_PK56) || head.equals(ZIP_MAGIC_PK78);
}

export function hasOleSpreadsheetMagic(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(OLE_MAGIC);
}

/** CSV uploads must be text (no NUL bytes) with row/delimiter structure. */
export function looksLikeCsvText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0x00)) return false;
  const text = sample.toString("utf8");
  if (!text.trim()) return false;
  if (!/[\r\n]/.test(text)) return false;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return /[,;\t]/.test(firstLine) || firstLine.trim().length > 0;
}

export type SpreadsheetUploadKind = "xlsx" | "xls" | "csv";

export function validateSpreadsheetUploadBytes(buffer: Buffer, filename: string): SpreadsheetUploadKind {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    if (!looksLikeCsvText(buffer)) {
      throw new SpreadsheetUploadRejectedError("csv_magic_mismatch", "File content does not look like CSV text");
    }
    return "csv";
  }

  if (lower.endsWith(".xlsx")) {
    if (!hasZipSpreadsheetMagic(buffer)) {
      throw new SpreadsheetUploadRejectedError(
        "xlsx_magic_mismatch",
        "File content is not a valid XLSX (ZIP) archive"
      );
    }
    return "xlsx";
  }

  if (lower.endsWith(".xls")) {
    if (!hasOleSpreadsheetMagic(buffer)) {
      throw new SpreadsheetUploadRejectedError(
        "xls_magic_mismatch",
        "File content is not a valid XLS (OLE) document"
      );
    }
    return "xls";
  }

  throw new SpreadsheetUploadRejectedError("unsupported_extension", "Unsupported spreadsheet extension");
}
