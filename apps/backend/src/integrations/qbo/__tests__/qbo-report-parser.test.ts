import { describe, expect, it } from "vitest";
import type { QboReportResponse } from "../qbo-client.js";
import {
  amountToCents,
  parseTrialBalance,
  parseBalanceSheet,
  parseGeneralLedger,
  chunkDateRangeMonthly,
} from "../qbo-report-parser.js";

// ── exact-cents money parsing ───────────────────────────────────────────────
describe("amountToCents (exact string math, never parseFloat)", () => {
  it("parses plain and comma-grouped amounts to cents", () => {
    expect(amountToCents("1000.00")).toBe(100000n);
    expect(amountToCents("1,234.56")).toBe(123456n);
    expect(amountToCents("1,000,000.01")).toBe(100000001n);
  });

  it("treats empty string / null / undefined as zero (v2 empty-cell behavior)", () => {
    expect(amountToCents("")).toBe(0n);
    expect(amountToCents(null)).toBe(0n);
    expect(amountToCents(undefined)).toBe(0n);
    expect(amountToCents("   ")).toBe(0n);
  });

  it("handles negatives via leading minus and accounting parentheses", () => {
    expect(amountToCents("-50.50")).toBe(-5050n);
    expect(amountToCents("(1,234.56)")).toBe(-123456n);
    expect(amountToCents("($0.99)")).toBe(-99n);
  });

  it("pads a missing/short fractional part and handles integer values", () => {
    expect(amountToCents("5")).toBe(500n);
    expect(amountToCents("0.9")).toBe(90n);
    expect(amountToCents(".5")).toBe(50n);
  });

  it("does not lose precision on values that float math would corrupt", () => {
    // 0.1 + 0.2 !== 0.3 in float; string math is exact.
    expect(amountToCents("0.10") + amountToCents("0.20")).toBe(amountToCents("0.30"));
    expect(amountToCents("1234567890.12")).toBe(123456789012n);
  });

  it("throws (never silently mis-parses) on a non-numeric value", () => {
    expect(() => amountToCents("abc")).toThrow(/Unparseable/);
    expect(() => amountToCents("1.2.3")).toThrow(/Unparseable/);
  });
});

// ── Trial Balance fixtures (v1 numeric + v2 empty-cell shapes) ───────────────
const TB_V1: QboReportResponse = {
  Header: {
    ReportName: "TrialBalance",
    ReportBasis: "Accrual",
    StartPeriod: "2023-12-31",
    EndPeriod: "2023-12-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account" },
      { ColTitle: "Debit", ColType: "Money" },
      { ColTitle: "Credit", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      { type: "Data", ColData: [{ value: "Checking", id: "35" }, { value: "1,000.00" }, { value: "" }] },
      { type: "Data", ColData: [{ value: "Accounts Receivable", id: "84" }, { value: "500.50" }, { value: "" }] },
      { type: "Data", ColData: [{ value: "Opening Balance Equity", id: "90" }, { value: "" }, { value: "1,500.50" }] },
      // GrandTotal row carries no account id → must be skipped.
      { type: "Section", group: "GrandTotal", Summary: { ColData: [{ value: "TOTAL" }, { value: "1,500.50" }, { value: "1,500.50" }] } },
    ],
  },
};

// Same data, but columns are in a DIFFERENT order (Credit before Debit) and empty cells are "" —
// proves resolution is by ColTitle, not by index, and v2 empty cells parse to zero.
const TB_V2_REORDERED: QboReportResponse = {
  Header: { ReportName: "TrialBalance", ReportBasis: "Cash", StartPeriod: "2023-12-31", EndPeriod: "2023-12-31", Currency: "USD" },
  Columns: {
    Column: [
      { ColTitle: "Account", ColType: "Account" },
      { ColTitle: "Credit", ColType: "Money" },
      { ColTitle: "Debit", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      { type: "Data", ColData: [{ value: "Checking", id: "35" }, { value: "" }, { value: "1000.00" }] },
      { type: "Data", ColData: [{ value: "Opening Balance Equity", id: "90" }, { value: "1000.00" }, { value: "" }] },
    ],
  },
};

// Nested/grouped layout: a parent account section wrapping child account rows.
const TB_NESTED: QboReportResponse = {
  Header: { ReportName: "TrialBalance", ReportBasis: "Accrual", StartPeriod: "2023-12-31", EndPeriod: "2023-12-31", Currency: "USD" },
  Columns: { Column: [{ ColTitle: "", ColType: "Account" }, { ColTitle: "Debit", ColType: "Money" }, { ColTitle: "Credit", ColType: "Money" }] },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "Bank Accounts" }] }, // header WITHOUT id → grouping only, not an account
        Rows: {
          Row: [
            { type: "Data", ColData: [{ value: "Checking", id: "35" }, { value: "800.00" }, { value: "" }] },
            { type: "Data", ColData: [{ value: "Savings", id: "36" }, { value: "200.00" }, { value: "" }] },
          ],
        },
        Summary: { ColData: [{ value: "Total Bank Accounts" }, { value: "1,000.00" }, { value: "" }] },
      },
      { type: "Data", ColData: [{ value: "Opening Balance Equity", id: "90" }, { value: "" }, { value: "1,000.00" }] },
    ],
  },
};

describe("parseTrialBalance", () => {
  it("parses account rows, skips the GrandTotal row, and balances", () => {
    const parsed = parseTrialBalance(TB_V1);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.reportBasis).toBe("Accrual");
    expect(parsed.endPeriod).toBe("2023-12-31");
    const debitSum = parsed.lines.reduce((a, l) => a + l.debit_cents, 0n);
    const creditSum = parsed.lines.reduce((a, l) => a + l.credit_cents, 0n);
    expect(debitSum).toBe(150050n);
    expect(creditSum).toBe(150050n);
    expect(debitSum).toBe(creditSum); // TB is balanced
    const ar = parsed.lines.find((l) => l.qbo_account_id === "84");
    expect(ar?.debit_cents).toBe(50050n);
    expect(ar?.credit_cents).toBe(0n); // "" → 0
  });

  it("resolves columns by title regardless of order and handles v2 empty cells", () => {
    const parsed = parseTrialBalance(TB_V2_REORDERED);
    expect(parsed.reportBasis).toBe("Cash");
    const checking = parsed.lines.find((l) => l.qbo_account_id === "35");
    expect(checking?.debit_cents).toBe(100000n);
    expect(checking?.credit_cents).toBe(0n);
    const obe = parsed.lines.find((l) => l.qbo_account_id === "90");
    expect(obe?.credit_cents).toBe(100000n);
    expect(obe?.debit_cents).toBe(0n);
  });

  it("recurses nested sections and ignores group headers without an account id", () => {
    const parsed = parseTrialBalance(TB_NESTED);
    const ids = parsed.lines.map((l) => l.qbo_account_id).sort();
    expect(ids).toEqual(["35", "36", "90"]);
    const debitSum = parsed.lines.reduce((a, l) => a + l.debit_cents, 0n);
    const creditSum = parsed.lines.reduce((a, l) => a + l.credit_cents, 0n);
    expect(debitSum).toBe(100000n);
    expect(creditSum).toBe(100000n);
  });
});

// ── Balance Sheet fixtures (Intuit nested Section + Account/Total shape) ────
// Mirrors public Intuit BalanceSheet samples: nested ASSETS → Current Assets →
// Bank Accounts → leaf Data rows with account id; Summary/TOTAL rows have no id.
const BS_INTUIT_NESTED: QboReportResponse = {
  Header: {
    ReportName: "BalanceSheet",
    ReportBasis: "Accrual",
    StartPeriod: "2026-03-31",
    EndPeriod: "2026-03-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] },
      { ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "ASSETS" }, { value: "" }] },
        Rows: {
          Row: [
            {
              type: "Section",
              Header: { ColData: [{ value: "Current Assets" }, { value: "" }] },
              Rows: {
                Row: [
                  {
                    type: "Section",
                    Header: { ColData: [{ value: "Bank Accounts" }, { value: "" }] },
                    Rows: {
                      Row: [
                        {
                          type: "Data",
                          ColData: [{ value: "Checking", id: "35" }, { value: "1,350.55" }],
                        },
                        {
                          type: "Data",
                          ColData: [{ value: "Savings", id: "36" }, { value: "800.00" }],
                        },
                      ],
                    },
                    Summary: { ColData: [{ value: "Total Bank Accounts" }, { value: "2,150.55" }] },
                  },
                  {
                    type: "Data",
                    ColData: [{ value: "Accounts Receivable (A/R)", id: "84" }, { value: "500.50" }],
                  },
                ],
              },
              Summary: { ColData: [{ value: "Total Current Assets" }, { value: "2,651.05" }] },
            },
          ],
        },
        Summary: { ColData: [{ value: "TOTAL ASSETS" }, { value: "2,651.05" }] },
        group: "TotalAssets",
      },
      {
        type: "Section",
        Header: { ColData: [{ value: "LIABILITIES AND EQUITY" }, { value: "" }] },
        Rows: {
          Row: [
            {
              type: "Section",
              Header: { ColData: [{ value: "Liabilities" }, { value: "" }] },
              Rows: {
                Row: [
                  {
                    type: "Data",
                    ColData: [{ value: "Accounts Payable (A/P)", id: "33" }, { value: "400.00" }],
                  },
                ],
              },
              Summary: { ColData: [{ value: "Total Liabilities" }, { value: "400.00" }] },
            },
            {
              type: "Section",
              Header: { ColData: [{ value: "Equity" }, { value: "" }] },
              Rows: {
                Row: [
                  {
                    type: "Data",
                    ColData: [{ value: "Opening Balance Equity", id: "90" }, { value: "2,251.05" }],
                  },
                ],
              },
              Summary: { ColData: [{ value: "Total Equity" }, { value: "2,251.05" }] },
            },
          ],
        },
        Summary: { ColData: [{ value: "TOTAL LIABILITIES AND EQUITY" }, { value: "2,651.05" }] },
        group: "TotalLiabilitiesAndEquity",
      },
    ],
  },
};

// v2 empty cells + Total column before Account (metadata resolution, not index).
const BS_V2_REORDERED: QboReportResponse = {
  Header: {
    ReportName: "BalanceSheet",
    ReportBasis: "Cash",
    StartPeriod: "2026-03-31",
    EndPeriod: "2026-03-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "Total", ColType: "Money" },
      { ColTitle: "Account", ColType: "Account" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "" }, { value: "ASSETS" }] },
        Rows: {
          Row: [
            {
              type: "Data",
              ColData: [{ value: "1,000.00" }, { value: "Checking", id: "35" }],
            },
            {
              type: "Data",
              ColData: [{ value: "" }, { value: "Zero Balance Account", id: "99" }],
            },
          ],
        },
        Summary: { ColData: [{ value: "1,000.00" }, { value: "TOTAL ASSETS" }] },
      },
    ],
  },
};

// Ambiguous multi-period money columns (summarize_columns_by=Month without Total) → fail closed.
const BS_AMBIGUOUS_MONEY: QboReportResponse = {
  Header: {
    ReportName: "BalanceSheet",
    ReportBasis: "Accrual",
    StartPeriod: "2026-01-01",
    EndPeriod: "2026-03-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account" },
      { ColTitle: "Jan 2026", ColType: "Money" },
      { ColTitle: "Feb 2026", ColType: "Money" },
      { ColTitle: "Mar 2026", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Data",
        ColData: [
          { value: "Checking", id: "35" },
          { value: "100.00" },
          { value: "200.00" },
          { value: "300.00" },
        ],
      },
    ],
  },
};

describe("parseBalanceSheet", () => {
  it("parses nested Intuit-shaped sections, skips Summary/TOTAL rows, exact cents", () => {
    const parsed = parseBalanceSheet(BS_INTUIT_NESTED);
    expect(parsed.reportBasis).toBe("Accrual");
    expect(parsed.startPeriod).toBe("2026-03-31");
    expect(parsed.endPeriod).toBe("2026-03-31");
    expect(parsed.currency).toBe("USD");
    expect(parsed.lines).toHaveLength(5);
    expect(parsed.skippedRowCount).toBe(0); // Summary-only sections have no ColData leaf → not counted

    const byId = new Map(parsed.lines.map((l) => [l.qbo_account_id, l]));
    expect(byId.get("35")).toEqual({
      qbo_account_id: "35",
      account_name: "Checking",
      balance_cents: 135055n,
    });
    expect(byId.get("36")?.balance_cents).toBe(80000n);
    expect(byId.get("84")?.balance_cents).toBe(50050n);
    expect(byId.get("33")?.balance_cents).toBe(40000n);
    expect(byId.get("90")?.balance_cents).toBe(225105n);

    // Leaf balances as QBO presents on BS (natural-side positive amounts).
    const sum = parsed.lines.reduce((a, l) => a + l.balance_cents, 0n);
    expect(sum).toBe(135055n + 80000n + 50050n + 40000n + 225105n);
  });

  it("resolves Total/Account by metadata regardless of column order; empty Total → 0", () => {
    const parsed = parseBalanceSheet(BS_V2_REORDERED);
    expect(parsed.reportBasis).toBe("Cash");
    expect(parsed.lines).toHaveLength(2);
    const checking = parsed.lines.find((l) => l.qbo_account_id === "35");
    expect(checking?.balance_cents).toBe(100000n);
    const zero = parsed.lines.find((l) => l.qbo_account_id === "99");
    expect(zero?.balance_cents).toBe(0n);
  });

  it("fails closed when multiple Money columns exist without ColTitle Total", () => {
    expect(() => parseBalanceSheet(BS_AMBIGUOUS_MONEY)).toThrow(
      /cannot resolve a single as-of money column/,
    );
  });

  it("fails closed when Columns metadata is missing", () => {
    expect(() =>
      parseBalanceSheet({
        Header: { ReportName: "BalanceSheet" },
        Rows: { Row: [] },
      }),
    ).toThrow(/no Columns metadata/);
  });

  it("throws on unparseable money cells (never silently mis-parses)", () => {
    const bad: QboReportResponse = {
      Header: { ReportName: "BalanceSheet", EndPeriod: "2026-03-31" },
      Columns: {
        Column: [
          { ColTitle: "", ColType: "Account" },
          { ColTitle: "Total", ColType: "Money" },
        ],
      },
      Rows: {
        Row: [
          {
            type: "Data",
            ColData: [{ value: "Checking", id: "35" }, { value: "not-money" }],
          },
        ],
      },
    };
    expect(() => parseBalanceSheet(bad)).toThrow(/Unparseable/);
  });
});

// ── General Ledger fixtures ─────────────────────────────────────────────────
const GL_V1: QboReportResponse = {
  Header: { ReportName: "GeneralLedger", ReportBasis: "Accrual", StartPeriod: "2024-01-01", EndPeriod: "2024-01-31", Currency: "USD" },
  Columns: {
    Column: [
      { ColTitle: "Date", ColType: "Date" },
      { ColTitle: "Transaction Type", ColType: "String" },
      { ColTitle: "Num", ColType: "String" },
      { ColTitle: "Name", ColType: "String" },
      { ColTitle: "Memo/Description", ColType: "String" },
      { ColTitle: "Debit", ColType: "Money" },
      { ColTitle: "Credit", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "Checking", id: "35" }] },
        Rows: {
          Row: [
            // Beginning Balance row: no txn id → NOT a posting → skipped.
            { type: "Data", ColData: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "Beginning Balance" }, { value: "" }, { value: "" }] },
            { type: "Data", ColData: [{ value: "2024-01-05", id: "1001" }, { value: "Invoice" }, { value: "INV-1" }, { value: "Acme" }, { value: "Load haul" }, { value: "1,200.00" }, { value: "" }] },
            { type: "Data", ColData: [{ value: "2024-01-09", id: "1002" }, { value: "Bill Payment" }, { value: "BP-9" }, { value: "Fuel Co" }, { value: "" }, { value: "" }, { value: "300.00" }] },
          ],
        },
        Summary: { ColData: [{ value: "Total for Checking" }, { value: "1,200.00" }, { value: "300.00" }] },
      },
      {
        type: "Section",
        Header: { ColData: [{ value: "Line Haul Revenue", id: "91" }] },
        Rows: {
          Row: [
            { type: "Data", ColData: [{ value: "2024-01-05", id: "1001" }, { value: "Invoice" }, { value: "INV-1" }, { value: "Acme" }, { value: "Load haul" }, { value: "" }, { value: "1,200.00" }] },
          ],
        },
      },
    ],
  },
};

// v2 shape with reordered columns (Credit before Debit) + "" empties.
const GL_V2_REORDERED: QboReportResponse = {
  Header: { ReportName: "GeneralLedger", ReportBasis: "Accrual", StartPeriod: "2024-01-01", EndPeriod: "2024-01-31", Currency: "USD" },
  Columns: {
    Column: [
      { ColTitle: "Transaction Type", ColType: "String" },
      { ColTitle: "Date", ColType: "Date" },
      { ColTitle: "Credit", ColType: "Money" },
      { ColTitle: "Debit", ColType: "Money" },
      { ColTitle: "Memo/Description", ColType: "String" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "Checking", id: "35" }] },
        Rows: {
          Row: [
            { type: "Data", ColData: [{ value: "Invoice", id: "1001" }, { value: "2024-01-05" }, { value: "" }, { value: "1200.00" }, { value: "Load haul" }] },
          ],
        },
      },
    ],
  },
};

// CRITICAL regression fixture: the Name column comes FIRST (v2 reorder) and its cell carries the
// customer list-id, while the Date cell carries the real transaction id. The txn id must come from the
// transaction columns, NEVER from the Name cell — otherwise qbo_txn_id/posting_line_key silently become
// the customer id and destabilize the import idempotency key.
const GL_NAME_CELL_HAS_ID: QboReportResponse = {
  Header: { ReportName: "GeneralLedger", ReportBasis: "Accrual", StartPeriod: "2024-01-01", EndPeriod: "2024-01-31", Currency: "USD" },
  Columns: {
    Column: [
      { ColTitle: "Name", ColType: "String" },
      { ColTitle: "Date", ColType: "Date" },
      { ColTitle: "Transaction Type", ColType: "String" },
      { ColTitle: "Debit", ColType: "Money" },
      { ColTitle: "Credit", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "Checking", id: "35" }] },
        Rows: {
          Row: [
            {
              type: "Data",
              ColData: [
                { value: "Acme Corp", id: "CUST-99" }, // Name cell carries the CUSTOMER id (a trap)
                { value: "2024-01-05", id: "TXN-1001" }, // Date cell carries the real transaction id
                { value: "Invoice" },
                { value: "1200.00" },
                { value: "" },
              ],
            },
          ],
        },
      },
    ],
  },
};

describe("parseGeneralLedger", () => {
  it("takes the txn id from transaction columns, never the Name cell's customer id (v2 reorder)", () => {
    const parsed = parseGeneralLedger(GL_NAME_CELL_HAS_ID);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].qbo_txn_id).toBe("TXN-1001"); // NOT "CUST-99"
    expect(parsed.lines[0].posting_line_key.startsWith("TXN-1001:35:")).toBe(true);
    expect(parsed.lines[0].name).toBe("Acme Corp");
    expect(parsed.lines[0].debit_cents).toBe(120000n);
  });

  it("flattens transaction lines grouped by account, skipping non-transaction rows", () => {
    const parsed = parseGeneralLedger(GL_V1);
    expect(parsed.lines).toHaveLength(3); // Beginning Balance skipped
    expect(parsed.skippedRowCount).toBe(1); // the one Beginning-Balance row
    const byKey = new Map(parsed.lines.map((l) => [l.posting_line_key, l]));

    const invoiceDebit = byKey.get("1001:35:0");
    expect(invoiceDebit?.qbo_account_id).toBe("35");
    expect(invoiceDebit?.qbo_txn_id).toBe("1001");
    expect(invoiceDebit?.txn_type).toBe("Invoice");
    expect(invoiceDebit?.doc_num).toBe("INV-1");
    expect(invoiceDebit?.debit_cents).toBe(120000n);
    expect(invoiceDebit?.credit_cents).toBe(0n);

    const invoiceCredit = byKey.get("1001:91:0");
    expect(invoiceCredit?.qbo_account_id).toBe("91");
    expect(invoiceCredit?.credit_cents).toBe(120000n);

    // The invoice transaction (id 1001) balances across its two account sections.
    const txn1001 = parsed.lines.filter((l) => l.qbo_txn_id === "1001");
    const d = txn1001.reduce((a, l) => a + l.debit_cents, 0n);
    const c = txn1001.reduce((a, l) => a + l.credit_cents, 0n);
    expect(d).toBe(c);
  });

  it("derives a stable, unique composite posting_line_key per (txn, account) line", () => {
    const parsed = parseGeneralLedger(GL_V1);
    const keys = parsed.lines.map((l) => l.posting_line_key);
    expect(new Set(keys).size).toBe(keys.length); // all unique
    expect(keys).toContain("1002:35:0");
  });

  it("resolves columns by title regardless of order (v2 reordered) and coerces empties", () => {
    const parsed = parseGeneralLedger(GL_V2_REORDERED);
    expect(parsed.lines).toHaveLength(1);
    const line = parsed.lines[0];
    expect(line.qbo_txn_id).toBe("1001");
    expect(line.txn_type).toBe("Invoice");
    expect(line.txn_date).toBe("2024-01-05");
    expect(line.debit_cents).toBe(120000n);
    expect(line.credit_cents).toBe(0n);
  });
});

// ── monthly chunking ────────────────────────────────────────────────────────
describe("chunkDateRangeMonthly", () => {
  it("returns a single clipped chunk for a within-one-month range", () => {
    expect(chunkDateRangeMonthly("2024-03-10", "2024-03-20")).toEqual([{ start: "2024-03-10", end: "2024-03-20" }]);
  });

  it("clips the first and last months, full months in between, no gaps/overlaps", () => {
    const chunks = chunkDateRangeMonthly("2024-01-15", "2024-03-10");
    expect(chunks).toEqual([
      { start: "2024-01-15", end: "2024-01-31" },
      { start: "2024-02-01", end: "2024-02-29" }, // 2024 is a leap year
      { start: "2024-03-01", end: "2024-03-10" },
    ]);
  });

  it("handles leap vs non-leap February month-ends", () => {
    expect(chunkDateRangeMonthly("2024-02-01", "2024-02-29")).toEqual([{ start: "2024-02-01", end: "2024-02-29" }]);
    expect(chunkDateRangeMonthly("2025-02-01", "2025-02-28")).toEqual([{ start: "2025-02-01", end: "2025-02-28" }]);
  });

  it("spans a full calendar year in 12 contiguous chunks", () => {
    const chunks = chunkDateRangeMonthly("2024-01-01", "2024-12-31");
    expect(chunks).toHaveLength(12);
    expect(chunks[0]).toEqual({ start: "2024-01-01", end: "2024-01-31" });
    expect(chunks[11]).toEqual({ start: "2024-12-01", end: "2024-12-31" });
    // contiguity: each chunk end + 1 day == next chunk start
    for (let i = 1; i < chunks.length; i += 1) {
      const prevEnd = new Date(`${chunks[i - 1].end}T00:00:00Z`);
      const nextStart = new Date(`${chunks[i].start}T00:00:00Z`);
      expect(nextStart.getTime() - prevEnd.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("spans across a year boundary", () => {
    const chunks = chunkDateRangeMonthly("2024-11-15", "2025-01-10");
    expect(chunks).toEqual([
      { start: "2024-11-15", end: "2024-11-30" },
      { start: "2024-12-01", end: "2024-12-31" },
      { start: "2025-01-01", end: "2025-01-10" },
    ]);
  });

  it("handles a single-day range and rejects an inverted range", () => {
    expect(chunkDateRangeMonthly("2024-06-15", "2024-06-15")).toEqual([{ start: "2024-06-15", end: "2024-06-15" }]);
    expect(() => chunkDateRangeMonthly("2024-06-15", "2024-06-10")).toThrow(/after end/);
  });

  it("rejects semantically-invalid dates (not just malformed strings)", () => {
    expect(() => chunkDateRangeMonthly("2024-13-01", "2024-13-05")).toThrow(/Invalid month/);
    expect(() => chunkDateRangeMonthly("2024-02-30", "2024-03-01")).toThrow(/Invalid day/);
    expect(() => chunkDateRangeMonthly("2025-02-29", "2025-03-01")).toThrow(/Invalid day/); // 2025 not leap
    expect(() => chunkDateRangeMonthly("2024/01/01", "2024-02-01")).toThrow(/YYYY-MM-DD/);
  });
});
