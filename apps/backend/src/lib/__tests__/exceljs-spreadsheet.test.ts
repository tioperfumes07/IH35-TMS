import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { renderStatementXlsx } from "../../accounting/statement-export-xlsx.service.js";
import {
  addArrayWorksheet,
  addObjectWorksheet,
  safeWorksheetName,
  uniqueWorksheetName,
  writeWorkbookBuffer,
} from "../exceljs-workbook.js";
import { readUntrustedSpreadsheetRows } from "../untrusted-spreadsheet-read.js";

async function openWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("ExcelJS spreadsheet closeout", () => {
  it("parses untrusted XLSX and quoted CSV without SheetJS", async () => {
    const source = new ExcelJS.Workbook();
    source.addWorksheet("Input").addRows([
      ["code", "description"],
      ["A1", "Fuel, tolls"],
    ]);
    const xlsx = Buffer.from(await source.xlsx.writeBuffer());

    await expect(readUntrustedSpreadsheetRows(xlsx, "input.xlsx")).resolves.toEqual([
      { code: "A1", description: "Fuel, tolls" },
    ]);
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from('code,description\r\nA1,"Fuel, tolls"\r\n'), "input.csv")
    ).resolves.toEqual([{ code: "A1", description: "Fuel, tolls" }]);
  });

  it("normalizes duplicate and empty XLSX headers with the shared SheetJS contract", async () => {
    const source = new ExcelJS.Workbook();
    source.addWorksheet("Input").addRows([
      ["id", "id", null, "id"],
      [1, 2, 3, 4],
    ]);
    const xlsx = Buffer.from(await source.xlsx.writeBuffer());

    await expect(readUntrustedSpreadsheetRows(xlsx, "headers.xlsx")).resolves.toEqual([
      { id: 1, id_1: 2, __EMPTY: 3, id_2: 4 },
    ]);
  });

  it("normalizes untrusted XLSX formula, hyperlink, and rich-text cells without object corruption", async () => {
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("Input");
    sheet.addRow(["formula_without_result", "formula_with_result", "hyperlink", "rich_text"]);
    const row = sheet.addRow([]);
    row.getCell(1).value = { formula: "1+1" };
    row.getCell(2).value = { formula: "1+1", result: 2 };
    row.getCell(3).value = { text: "Evidence", hyperlink: "https://example.test/evidence" };
    row.getCell(4).value = { richText: [{ text: "Block " }, { text: "Title" }] };
    const xlsx = Buffer.from(await source.xlsx.writeBuffer());

    await expect(readUntrustedSpreadsheetRows(xlsx, "input.xlsx")).resolves.toEqual([
      {
        formula_without_result: null,
        formula_with_result: 2,
        hyperlink: "Evidence",
        rich_text: "Block Title",
      },
    ]);
  });

  it("preserves the measured SheetJS CSV scalar contract used by fuel imports", async () => {
    // Expected values were captured from a disposable xlsx@0.18.5 process using
    // read(type:string) + sheet_to_json(defval:null); xlsx is not a repo dependency.
    const csv =
      "id,num,bool_true,bool_false,date,iso,blank,quoted,escaped,formula\r\n" +
      '00123,-7.50,TRUE,FALSE,1/2/2026,2026-01-02,,"Fuel, tolls","He said ""go""",=1+2\r\n' +
      "00001,0,true,false,12/31/2025,2025-12-31,,plain,quote,+SUM(A1:A2)\r\n";

    const rows = await readUntrustedSpreadsheetRows(Buffer.from(csv), "fuel.csv", { cellDates: true });
    expect(rows).toEqual([
      {
        id: 123,
        num: -7.5,
        bool_true: true,
        bool_false: false,
        date: 46024,
        iso: legacySheetJsDateSerial(new Date("2026-01-02")),
        blank: null,
        quoted: "Fuel, tolls",
        escaped: 'He said "go"',
        formula: null,
      },
      {
        id: 1,
        num: 0,
        bool_true: "true",
        bool_false: "false",
        date: 46022,
        iso: legacySheetJsDateSerial(new Date("2025-12-31")),
        blank: null,
        quoted: "plain",
        escaped: "quote",
        formula: "+SUM(A1:A2)",
      },
    ]);
  });

  it("preserves SheetJS delimiter detection for semicolon and tab CSV", async () => {
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from("id;amount;blank\r\n00123;42;\r\n"), "semicolon.csv")
    ).resolves.toEqual([{ id: 123, amount: 42, blank: null }]);
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from("id\tamount\tblank\r\n00123\t42\t\r\n"), "tab.csv")
    ).resolves.toEqual([{ id: 123, amount: 42, blank: null }]);
  });

  it("preserves measured SheetJS duplicate-header suffixing", async () => {
    // Differential result from xlsx@0.18.5:
    // [{"id":1,"id_1":2,"id_2":3}]
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from("id,id,id\r\n1,2,3\r\n"), "duplicates.csv")
    ).resolves.toEqual([{ id: 1, id_1: 2, id_2: 3 }]);
  });

  it("preserves measured SheetJS empty-header names and suffixes", async () => {
    // Differential result from xlsx@0.18.5:
    // [{"id":1,"__EMPTY":2,"__EMPTY_1":3,"id_1":4,"__EMPTY_2":5}]
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from("id,,,id,\r\n1,2,3,4,5\r\n"), "empty-headers.csv")
    ).resolves.toEqual([
      { id: 1, __EMPTY: 2, __EMPTY_1: 3, id_1: 4, __EMPTY_2: 5 },
    ]);
  });

  it("preserves CSV fields beyond the header with SheetJS-compatible empty keys", async () => {
    await expect(
      readUntrustedSpreadsheetRows(
        Buffer.from("id,name\r\n1,Alpha,extra-one,extra-two\r\n2,Beta,extra-three\r\n"),
        "extra-fields.csv"
      )
    ).resolves.toEqual([
      { id: 1, name: "Alpha", __EMPTY: "extra-one", __EMPTY_1: "extra-two" },
      { id: 2, name: "Beta", __EMPTY: "extra-three", __EMPTY_1: null },
    ]);
  });

  it("suffixes extra CSV fields without colliding with explicit empty-key headers", async () => {
    await expect(
      readUntrustedSpreadsheetRows(
        Buffer.from("__EMPTY_1,__EMPTY\r\nexplicit-one,explicit-zero,extra-a,extra-b\r\n"),
        "extra-field-collisions.csv"
      )
    ).resolves.toEqual([
      {
        __EMPTY_1: "explicit-one",
        __EMPTY: "explicit-zero",
        __EMPTY_2: "extra-a",
        __EMPTY_3: "extra-b",
      },
    ]);
  });

  it("preserves measured SheetJS whitespace-only CSV values as strings", async () => {
    // Differential result from xlsx@0.18.5:
    // [{"a":" ","b":"  ","c":"\t","d":null}]
    await expect(
      readUntrustedSpreadsheetRows(Buffer.from("a,b,c,d\r\n ,  ,\t,\r\n"), "whitespace.csv")
    ).resolves.toEqual([{ a: " ", b: "  ", c: "\t", d: null }]);
  });

  it("consumes measured SheetJS sep directives as delimiter metadata", async () => {
    // Differential result from xlsx@0.18.5:
    // [{"id":1,"name":"Alpha","amount":42}]
    await expect(
      readUntrustedSpreadsheetRows(
        Buffer.from("sep=;\r\nid;name;amount\r\n001;Alpha;42\r\n"),
        "separator-directive.csv"
      )
    ).resolves.toEqual([{ id: 1, name: "Alpha", amount: 42 }]);
  });

  it("matches measured SheetJS XLSX cellDates false serials and true Central instants", async () => {
    // The controlled XLSX stores the exact numeric serials 46220 and
    // 46220.64635416667 with date formats. A disposable xlsx@0.18.5 process
    // measured false => those serials, true => the two exact instants below.
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("Input");
    sheet.addRow(["date_only", "timestamp"]);
    sheet.getCell("A2").value = 46220;
    sheet.getCell("A2").numFmt = "yyyy-mm-dd";
    sheet.getCell("B2").value = 46220.64635416667;
    sheet.getCell("B2").numFmt = "yyyy-mm-dd hh:mm:ss";
    const xlsx = Buffer.from(await source.xlsx.writeBuffer());

    const serialRows = await readUntrustedSpreadsheetRows(xlsx, "dates.xlsx", { cellDates: false });
    expect(serialRows[0]?.date_only).toBe(46220);
    expect(serialRows[0]?.timestamp).toBeCloseTo(46220.64635416667, 10);

    await expect(
      readUntrustedSpreadsheetRows(xlsx, "dates.xlsx", { cellDates: true })
    ).resolves.toEqual([
      {
        date_only: new Date("2026-07-17T05:00:00.000Z"),
        timestamp: new Date("2026-07-17T20:30:45.000Z"),
      },
    ]);
  });

  it("rejects legacy parsed XLS while document storage remains outside this parser", async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(readUntrustedSpreadsheetRows(ole, "legacy.xls")).rejects.toMatchObject({
      code: "legacy_xls_unsupported",
    });
  });

  it("writes openable array and object workbooks with deterministic 31-character names", async () => {
    const workbook = new ExcelJS.Workbook();
    addArrayWorksheet(workbook, "Array", [["header"], ["value"]]);
    addObjectWorksheet(workbook, "Bank Account Reconciliation Variances", [{ total: 12.34 }]);
    const reopened = await openWorkbook(await writeWorkbookBuffer(workbook));

    expect(reopened.worksheets.map((sheet) => sheet.name)).toEqual([
      "Array",
      safeWorksheetName("Bank Account Reconciliation Variances"),
    ]);
    expect(reopened.worksheets[1]?.name).toHaveLength(31);
    expect(reopened.worksheets[1]?.getCell("A2").value).toBe(12.34);
  });

  it("resolves duplicate truncated worksheet names deterministically", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("1234567890123456789012345678901");
    expect(uniqueWorksheetName(workbook, "1234567890123456789012345678901B")).toBe(
      "123456789012345678901234567 (2)"
    );
  });

  it("keeps accounting statement values in an openable XLSX", async () => {
    const reopened = await openWorkbook(
      await renderStatementXlsx({
        sheetName: "Trial Balance",
        rows: [["Account", "Balance"], ["Cash", 125.5]],
      })
    );
    expect(reopened.getWorksheet("Trial Balance")?.getCell("A2").value).toBe("Cash");
    expect(reopened.getWorksheet("Trial Balance")?.getCell("B2").value).toBe(125.5);
  });
});

function legacySheetJsDateSerial(value: Date): number {
  const epoch = new Date(1899, 11, 30);
  return (
    (value.getTime() - epoch.getTime()) / 86_400_000 -
    (value.getTimezoneOffset() - epoch.getTimezoneOffset()) / 1_440
  );
}
