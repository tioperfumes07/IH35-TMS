/**
 * PERFUME mail engine — the server reader reads a price list the way the Lists tab reads it (owner 2026-11-25 17:29 CT:
 * "AN ENGINE THAT … GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW PRICES").
 * Parity: the same header row, the same columns, the same lines and the same to-the-cent file total as the browser
 * reader (apps/frontend/src/pages/perfume/perfumeFileReaders.ts) on the same cells — so a list saved by mail equals
 * the same list saved by hand. Then each file type the engine opens, and each case it HOLDS instead of guessing.
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import * as browser from "../../../../frontend/src/pages/perfume/perfumeFileReaders.js";
import {
  applySavedColumns, chooseReading, extractRows, findHeaderRow, guessMapping, isOleXls, parseCsv, pdfLinePairs, priceToCents, readPriceFile,
  isSpecialList, savedColumnsOf, splitCodedRow, SPECIAL_LIST_RE, UnreadableFileError, type Sheet,
} from "./readers.js";

const VENDOR_SHEET: Sheet = {
  name: "PRICE LIST",
  cells: [
    ["PERFUME CENTER OF AMERICA", null, null, null],
    ["Price list 11/24/2026", null, null, null],
    ["ITEM #", "UPC", "BRAND", "DESCRIPTION", "SIZE", "TYPE", "GENDER", "PRICE", "QTY", "CASE PACK"],
    ["WOMEN", null],
    ["A100", 3348901250153, "CHRISTIAN DIOR", "J'ADORE EDP 3.4 OZ", "3.4 OZ", "EDP", "W", 98.5, 12, 24],
    ["A101", "3274872390706", "CALVIN KLEIN", "CK ONE EDT 6.7 OZ", "6.7 OZ", "EDT", "U", "$21.75", "100+", null],
    ["MEN"],
    ["A102", "0085715166036", "JEAN PAUL GAULTIER", "LE MALE EDT 4.2 TESTER", "4.2 OZ", "EDT", "M", 42.125, 5, null],
    ["A103", null, "ARMAF", "CLUB DE NUIT INTENSE EDT 3.6", "3.6 OZ", "EDT", "M", "SOLD OUT", null, null],
    [null, null, null, null],
  ],
};

describe("server reader = the Lists tab reader (parity on the same cells)", () => {
  const headers = (VENDOR_SHEET.cells[2] ?? []).map((h) => String(h ?? ""));
  it("same header row and same column for every vendor field", () => {
    expect(findHeaderRow(VENDOR_SHEET.cells)).toBe(browser.findHeaderRow(VENDOR_SHEET.cells as never));
    const mine = guessMapping(headers);
    const theirs = browser.guessMapping(headers);
    for (const f of ["upc", "sku", "brand", "desc", "size", "type", "gender", "section", "price", "qty", "case_pack"] as const) expect(mine[f]).toBe(theirs[f]);
  });
  it("same lines, same section carried, same file total to the cent", () => {
    const hr = findHeaderRow(VENDOR_SHEET.cells);
    const map = guessMapping(headers);
    const a = extractRows(VENDOR_SHEET, hr, map);
    const b = browser.extractRows(VENDOR_SHEET as never, hr, map as never);
    expect(a.rowsRead).toBe(b.rowsRead);
    expect(a.fileTotalCents).toBe(b.fileTotalCents);
    expect(a.sections).toBe(b.sections);
    const pick = (r: Record<string, unknown>) => [r.row_no, r.upc, r.sku, r.brand, r.description, r.size_text, r.type, r.gender, r.section, r.price, r.qty, r.case_pack];
    expect(a.rows.map(pick)).toEqual(b.rows.map(pick as never));
    // 98.50 + 21.75 + 42.13 (42.125 rounds half up) = 162.38; "SOLD OUT" is not a price.
    expect(a.fileTotalCents).toBe(16238);
    expect(a.rows.map((r) => r.section)).toEqual(["WOMEN", "WOMEN", "MEN"]);
    expect(a.rows[0].upc).toBe("3348901250153");
  });
  it("price → cents and PDF pairs are the browser's rules", () => {
    for (const v of ["$1,234.50", 12.345, "12.344", "0.5", "", "N/A", 7, "15.00 USD"]) expect(priceToCents(v)).toBe(browser.priceToCents(v));
    for (const line of ["CHANEL N5 EDP 100ML $95.50 DIOR SAUVAGE EDT 100ML $88.00", "PRINCESS GIFT SET 3X30ML EDT   10.25", "$12.00", "3.4oz EDT+0.25oz"]) {
      expect(pdfLinePairs(line)).toEqual(browser.pdfLinePairs(line));
    }
  });
});

async function xlsxBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("each file type the engine opens", () => {
  it(".xlsx: formula results, merged title rows, the sheet with the most priced lines", async () => {
    const buf = await xlsxBuffer((wb) => {
      const notes = wb.addWorksheet("Notes");
      notes.addRow(["Terms", "Net 30", "FOB Miami"]);
      const ws = wb.addWorksheet("List");
      ws.addRow(["MIAMI TRADING ZONE — WHOLESALE"]);
      ws.mergeCells("A1:D1");
      ws.addRow(["Item", "Description", "UPC", "WHS Price"]);
      ws.addRow(["137792", "JO MALONE ENGLISH PEAR 1.0 EDC", "690251024834", 31.5]);
      ws.addRow(["137793", "VERSACE EROS EDT 3.4", "8011003809219", { formula: "2*20.4", result: 40.8 }]);
    });
    const file = await readPriceFile(buf, "MTZ 11-24.xlsx");
    expect(file.kind).toBe("xlsx");
    const pick = chooseReading(file, null)!;
    expect(pick.sheet.name).toBe("List");
    expect(pick.how).toBe("guessed");
    expect(pick.extracted.rowsRead).toBe(2);
    expect(pick.extracted.fileTotalCents).toBe(3150 + 4080);
    expect(pick.extracted.rows[1].upc).toBe("8011003809219");
  });
  it("the vendor's saved columns win over the guess (the columns the owner picked by hand)", async () => {
    const sheet: Sheet = { name: "S", cells: [["Code", "Name", "Price", "Special"], ["1", "X EDT", 10, 8], ["2", "Y EDP", 20, 15]] };
    const saved = savedColumnsOf({ mail_columns: { sheet: "S", fields: { desc: "Name", price: "Special", sku: "Code" } } })!;
    expect(applySavedColumns(sheet, saved)).toEqual({ headerRow: 0, map: { desc: 1, price: 3, sku: 0 } });
    const pick = chooseReading({ kind: "xlsx", sheets: [sheet] }, saved)!;
    expect(pick.how).toBe("saved_columns");
    expect(pick.extracted.fileTotalCents).toBe(2300);
    // Saved columns missing from this file → the guess (Price), not a failure.
    const other = chooseReading({ kind: "xlsx", sheets: [{ name: "S", cells: [["Code", "Name", "Price"], ["1", "X EDT", 10]] }] }, saved)!;
    expect([other.how, other.extracted.fileTotalCents]).toEqual(["guessed", 1000]);
    expect(savedColumnsOf({ mail_columns: { fields: { desc: "Name" } } })).toBeNull();
  });
  it(".csv: quotes, commas and line breaks inside quotes", async () => {
    expect(parseCsv('UPC,Description,Price\r\n"0123","BRAND ""X"", 100ML",12.50\n,,\n"9","MULTI\nLINE",3\n')).toEqual([
      ["UPC", "Description", "Price"], ["0123", 'BRAND "X", 100ML', "12.50"], ["9", "MULTI\nLINE", "3"],
    ]);
    const file = await readPriceFile(Buffer.from("UPC,Description,Price\n0123,ONE EDT,12.50\n0456,TWO EDP,$7.25\n"), "list.csv");
    expect(chooseReading(file, null)!.extracted.fileTotalCents).toBe(1975);
  });
  it("text PDF: every NAME $price pair, two columns per line (La Esperanza style)", async () => {
    const file = await readPriceFile(pdfWithLines(["LISTA N 19", "CHANEL N5 EDP 100ML $95.50   DIOR SAUVAGE EDT 100ML $88.00", "AZZARO CHROME EDT 100ML $29.00"]), "LISTA N19.pdf");
    expect(file.kind).toBe("pdf_text");
    const pick = chooseReading(file, null)!;
    expect(pick.how).toBe("pdf");
    expect(pick.extracted.rows.map((r) => [r.description, r.price])).toEqual([
      ["CHANEL N5 EDP 100ML", "95.50"], ["DIOR SAUVAGE EDT 100ML", "88.00"], ["AZZARO CHROME EDT 100ML", "29.00"],
    ]);
    expect(pick.extracted.fileTotalCents).toBe(21250);
  });
});

describe("held, never guessed", () => {
  it("old .xls, a scanned PDF and a non-price file are refused with their reason", async () => {
    await expect(readPriceFile(Buffer.from("x"), "old.xls")).rejects.toMatchObject({ reason: "old_xls" });
    await expect(readPriceFile(pdfWithLines([]), "scan.pdf")).rejects.toBeInstanceOf(UnreadableFileError);
    await expect(readPriceFile(pdfWithLines([]), "scan.pdf")).rejects.toMatchObject({ reason: "scanned_pdf" });
    await expect(readPriceFile(Buffer.from("x"), "photo.jpg")).rejects.toMatchObject({ reason: "unsupported_type" });
    await expect(readPriceFile(Buffer.from("not a zip"), "broken.xlsx")).rejects.toMatchObject({ reason: "unreadable" });
  });
  it("no description + price columns → no reading at all", () => {
    expect(chooseReading({ kind: "xlsx", sheets: [{ name: "S", cells: [["Terms", "Notes", "Contact"], ["Net 30", "FOB", "Ana"]] }] }, null)).toBeNull();
  });
  it("a special list (new arrivals, promo, Black Friday) is kept next to the vendor's list", () => {
    for (const n of ["NEW ARRIVALS 11-24.xlsx", "Black Friday PPW.xlsx", "PROMO NOV.pdf", "closeout list.csv"]) expect(SPECIAL_LIST_RE.test(n)).toBe(true);
    for (const n of ["PCA PRICE LIST 11-24.xlsx", "ALL BRANDS.xlsx", "LISTA N 19.pdf"]) expect(SPECIAL_LIST_RE.test(n)).toBe(false);
  });
  it("a PCA PDF line (gender · brand · origin · code · name in one run) is split so it links", () => {
    const base = { sheet: "PDF", row_no: 2, upc: null, sku: null, brand: null, size_text: null, type: null, gender: null, section: null, price: "34.50", qty: null, case_pack: null, raw: {} };
    expect(splitCodedRow({ ...base, description: "M Carolina Herrera ES I0088421 212 (M) EDT SP 1.7oz(NEW PACK" } as never)).toMatchObject(
      { sku: "I0088421", brand: "Carolina Herrera", gender: "Men", description: "Carolina Herrera 212 (M) EDT SP 1.7oz(NEW PACK" });
    expect(splitCodedRow({ ...base, description: "COS Completely Bare US I0087568 COMPLETELY CLEAN HAND SANITI" } as never)).toMatchObject(
      { sku: "I0087568", brand: "Completely Bare", gender: null });
    const plain = { ...base, description: "ARMAF CLUB DE NUIT EDT 100ML MAN" };
    expect(splitCodedRow(plain as never)).toBe(plain);
  });
  it("a full list mailed under a 'new arrivals' subject is the full list (PCA, Euro measured 2026-11-26)", () => {
    expect(isSpecialList("PRICE-LIST-11-25-2026.pdf", "FW: PERFUME CENTER OF AMERICA::::::::::::::NEW ARRIVALS & PRICE LIST")).toBe(false);
    expect(isSpecialList("Euro stock.xlsx", "Euro Updated Stock List With All New Arrivals")).toBe(false);
    expect(isSpecialList("list.xlsx", "JIZAN NEW ARRIVALS")).toBe(true);
    expect(isSpecialList("MAILTEST BLACK FRIDAY.csv", "Price list")).toBe(true);
    expect(isSpecialList("ALL BRANDS.xlsx", "Black Friday")).toBe(false);
    expect(isSpecialList("Nov list.xlsx", "Weekly price list")).toBe(false);
  });
});

/** A minimal valid one-page text PDF (Helvetica, one line per text row) — exact byte offsets in the xref. */
export function pdfWithLines(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = lines.map((l, i) => `BT /F1 10 Tf 40 ${760 - i * 20} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

describe("old .xls signature", () => {
  it("recognises the OLE2 signature of a real .xls and nothing else", () => {
    expect(isOleXls(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe(true);
    expect(isOleXls(Buffer.from("<html>price list</html>"))).toBe(false);
    expect(isOleXls(Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]))).toBe(false);
    expect(isOleXls(Buffer.alloc(3))).toBe(false);
  });
});

