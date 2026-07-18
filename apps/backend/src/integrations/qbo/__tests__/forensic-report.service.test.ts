import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendCrudAudit: vi.fn(),
  s3Send: vi.fn(async () => ({})),
  sql: [] as string[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class S3Client {
    send = mocks.s3Send;
  }
  return { PutObjectCommand, S3Client };
});

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocks.appendCrudAudit,
}));

vi.mock("../../../auth/db.js", () => {
  const query = vi.fn(async (sql: string) => {
    mocks.sql.push(sql);
    if (sql.includes("FROM qbo_archive.import_batches")) {
      return {
        rows: [
          {
            id: "batch-1",
            operating_company_id: "11111111-1111-4111-8111-111111111111",
            qbo_realm_id: "realm-trk",
          },
        ],
      };
    }
    if (sql.includes("GROUP BY qbo_entity_type, qbo_active_at_snapshot")) {
      return { rows: [{ qbo_entity_type: "Vendor", qbo_active_at_snapshot: true, count: 2 }] };
    }
    if (sql.includes("GROUP BY qbo_txn_type, EXTRACT")) {
      return { rows: [{ qbo_txn_type: "Expense", year: 2024, count: 3, total_cents: 10_000 }] };
    }
    if (sql.includes("embezzlement_window = true OR")) {
      return {
        rows: [
          issue("2024-03-03", 12_345, "positive"),
          issue("2024-03-02", -4_500, "negative"),
          {
            ...issue("2024-03-01", 0, "zero"),
            vendor_name: null,
            class_name: null,
            forensic_flags: null,
          },
        ],
      };
    }
    if (sql.includes("AND embezzlement_window = true")) {
      return {
        rows: [
          {
            txn_date: "2024-02-02",
            qbo_txn_type: "Check",
            entered_by: "owner",
            vendor_name: "Window Vendor",
            total_cents: -250,
            class_name: "T169",
            attachments_count: 1,
            forensic_flags: ["window"],
          },
        ],
      };
    }
    if (sql.includes("txn_date < DATE '2023-01-01'")) {
      return {
        rows: [
          {
            txn_date: "2022-12-31",
            qbo_txn_type: "Expense",
            vendor_name: "Historic Vendor",
            total_cents: 0,
            attachments_count: 0,
            forensic_flags: ["historic"],
          },
        ],
      };
    }
    if (sql.includes("qbo_active_at_snapshot = false")) {
      return {
        rows: [{ qbo_entity_type: "Vendor", name: "Inactive Vendor", last_active_date: "2023-05-01" }],
      };
    }
    return { rows: [] };
  });

  return {
    withLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
      fn({ query })
    ),
  };
});

import {
  FORENSIC_WORKSHEET_NAMES,
  generateExcelReport,
} from "../forensic-report.service.js";

function issue(txn_date: string, total_cents: number, id: string) {
  return {
    txn_date,
    qbo_txn_type: "Expense",
    vendor_name: `${id} vendor`,
    total_cents,
    class_name: "T169",
    forensic_flags: [id],
    qbo_txn_id: `txn-${id}`,
  };
}

beforeEach(() => {
  mocks.appendCrudAudit.mockReset();
  mocks.s3Send.mockClear();
  mocks.sql.length = 0;
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET_EVIDENCE = "evidence-test";
  process.env.QBO_REALM_ID_TRK = "realm-trk";
});

describe("QBO forensic ExcelJS report", () => {
  it("replaces the former >31-character SheetJS failure with six stable semantic sheets", async () => {
    const result = await generateExcelReport("actor-1", "batch-1");
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    const command = mocks.s3Send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    const body = command.input.Body as Buffer;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(FORENSIC_WORKSHEET_NAMES);
    expect(workbook.worksheets.every((sheet) => sheet.name.length <= 31 && sheet.name === sheet.name.trim())).toBe(
      true
    );

    const summary = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[0])!;
    expect(summary.getRow(1).values).toEqual([, "section", "key", "value"]);
    expect([2, 3, 4, 5].map((row) => summary.getRow(row).values)).toEqual([
      [, "Batch", "batch_id", "batch-1"],
      [, "Batch", "company", "TRK"],
      [, "Entities", "Vendor (active)", 2],
      [, "Transactions", "2024 Expense", "3 rows / 100.00 USD"],
    ]);

    const issues = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[1])!;
    expect(issues.getRow(1).values).toEqual([
      ,
      "Date",
      "Type",
      "Vendor",
      "Amount_USD",
      "QBO_Class",
      "Anomaly_Tags",
      "QBO_Link",
    ]);
    expect([2, 3, 4].map((row) => issues.getCell(`A${row}`).value)).toEqual([
      "2024-03-03",
      "2024-03-02",
      "2024-03-01",
    ]);
    expect([2, 3, 4].map((row) => issues.getCell(`B${row}`).value)).toEqual([
      "Expense",
      "Expense",
      "Expense",
    ]);
    expect([2, 3, 4].map((row) => issues.getCell(`C${row}`).value)).toEqual([
      "positive vendor",
      "negative vendor",
      "",
    ]);
    expect([2, 3, 4].map((row) => issues.getCell(`D${row}`).value)).toEqual([123.45, -45, 0]);
    expect([2, 3, 4].map((row) => issues.getCell(`E${row}`).value)).toEqual(["T169", "T169", ""]);
    expect([2, 3, 4].map((row) => issues.getCell(`F${row}`).value)).toEqual([
      "positive",
      "negative",
      "",
    ]);
    expect([2, 3, 4].map((row) => issues.getCell(`G${row}`).value)).toEqual([
      "https://qbo.intuit.com/app/txn?txnId=txn-positive",
      "https://qbo.intuit.com/app/txn?txnId=txn-negative",
      "https://qbo.intuit.com/app/txn?txnId=txn-zero",
    ]);

    const window = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[2])!;
    expect(window.getRow(1).values).toEqual([
      ,
      "Date",
      "Type",
      "Entered_By",
      "Vendor",
      "Amount_USD",
      "Class",
      "Has_Receipt",
      "Flags",
      "Review_Notes",
    ]);
    expect(window.getRow(2).values).toEqual([
      ,
      "2024-02-02",
      "Check",
      "owner",
      "Window Vendor",
      -2.5,
      "T169",
      "Yes",
      "window",
      "",
    ]);

    const pre2023 = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[3])!;
    expect(pre2023.getRow(1).values).toEqual([
      ,
      "Date",
      "Type",
      "Vendor",
      "Amount_USD",
      "Has_Receipt",
      "Flags",
    ]);
    expect(pre2023.getRow(2).values).toEqual([
      ,
      "2022-12-31",
      "Expense",
      "Historic Vendor",
      0,
      "No",
      "historic",
    ]);

    const variances = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[4])!;
    expect(variances.getRow(1).values).toEqual([, "Note"]);
    expect(variances.getRow(2).values).toEqual([
      ,
      "Variance sheet placeholder. Year-end comparisons populate as balances are archived.",
    ]);

    const inactive = workbook.getWorksheet(FORENSIC_WORKSHEET_NAMES[5])!;
    expect(inactive.getRow(1).values).toEqual([, "Type", "Name", "Last_Active_Date", "Notes"]);
    expect(inactive.getRow(2).values).toEqual([
      ,
      "Vendor",
      "Inactive Vendor",
      "2023-05-01",
      "",
    ]);

    expect(command.input.Bucket).toBe("evidence-test");
    expect(command.input.ContentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(command.input.Key).toBe(result.r2_key);
    expect(result.r2_key).toMatch(
      /^forensic-reports\/trk\/batch-1\/TRK_FORENSIC_REPORT_\d{4}-\d{2}-\d{2}\.xlsx$/
    );
  });

  it("keeps R2, append-only audit metadata, and QBO reads unchanged", async () => {
    const result = await generateExcelReport("actor-1", "batch-1");

    expect(mocks.appendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      "actor-1",
      "qbo_archive.report.generated",
      {
        batch_id: "batch-1",
        company_code: "TRK",
        r2_object_key: result.r2_key,
      },
      "info",
      "P5-T6-QBO-FORENSIC"
    );
    const financialSql = mocks.sql.filter((sql) => !sql.includes("set_config")).join("\n");
    expect(financialSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(financialSql).toContain("FROM qbo_archive.transactions_snapshot");
    expect(financialSql).toContain("ORDER BY txn_date DESC");
  });
});
