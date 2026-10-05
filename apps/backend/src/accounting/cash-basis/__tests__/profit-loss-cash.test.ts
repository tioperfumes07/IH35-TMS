import { describe, expect, it } from "vitest";
import {
  buildCashBasisProfitLoss,
  treatCashBasisSource,
  CASH_BASIS_SOURCE_TREATMENTS,
  type CashBasisPostingRow,
  type DocumentSettlementFacts,
} from "../profit-loss-cash.service.js";

function posting(over: Partial<CashBasisPostingRow> = {}): CashBasisPostingRow {
  return {
    posting_id: "p1",
    account_id: "acct-4000",
    account_code: "4000",
    account_name: "Freight Revenue",
    account_type: "Income",
    debit_or_credit: "credit",
    amount_cents: 100_000,
    source_transaction_type: "invoice",
    source_transaction_id: "inv-1",
    entry_date: "2026-02-10",
    ...over,
  };
}

function docs(entries: Record<string, DocumentSettlementFacts>) {
  return new Map(Object.entries(entries));
}

const EMPTY = new Map<string, DocumentSettlementFacts>();
const NO_SETTLEMENT_DATES = new Map<string, string | null>();

function build(over: Partial<Parameters<typeof buildCashBasisProfitLoss>[0]> = {}) {
  return buildCashBasisProfitLoss({
    postings: [],
    arDocuments: EMPTY,
    apDocuments: EMPTY,
    driverSettlementDates: NO_SETTLEMENT_DATES,
    from: "2026-01-01",
    to: "2026-12-31",
    ...over,
  });
}

describe("ACCT-F412 — the cash-basis P&L is computed from transactions", () => {
  it("THE DEFECT: an unpaid invoice's revenue is NOT in the cash-basis P&L", () => {
    const report = build({
      postings: [posting()],
      arDocuments: docs({ "inv-1": { total_cents: 100_000, events: [] } }),
    });
    // The old transform stamped settlement_date = as-of and recognized 100000 of 100000.
    expect(report.revenue.total).toBe(0);
    expect(report.net_income).toBe(0);
    // Not dropped — disclosed as the accrual-to-cash bridge.
    expect(report.deferred.total).toBe(100_000);
  });

  it("a PARTIAL payment recognizes PRO RATA, in the period the money moved", () => {
    const report = build({
      postings: [posting()],
      arDocuments: docs({
        "inv-1": { total_cents: 100_000, events: [{ date: "2026-03-15", amount_cents: 25_000 }] },
      }),
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(25_000);
    expect(report.deferred.total).toBe(75_000);
  });

  it("the same invoice contributes NOTHING to the month it was raised", () => {
    const february = build({
      postings: [posting()],
      arDocuments: docs({
        "inv-1": { total_cents: 100_000, events: [{ date: "2026-03-15", amount_cents: 100_000 }] },
      }),
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(february.revenue.total).toBe(0);
    const march = build({
      postings: [posting()],
      arDocuments: docs({
        "inv-1": { total_cents: 100_000, events: [{ date: "2026-03-15", amount_cents: 100_000 }] },
      }),
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(march.revenue.total).toBe(100_000);
  });

  it("a fully settled invoice's parts sum to the accrual figure EXACTLY, with no rounding drift", () => {
    const report = build({
      postings: [posting({ amount_cents: 100_001 })],
      arDocuments: docs({
        "inv-1": {
          total_cents: 100_001,
          events: [
            { date: "2026-03-01", amount_cents: 33_334 },
            { date: "2026-03-02", amount_cents: 33_334 },
            { date: "2026-03-03", amount_cents: 33_333 },
          ],
        },
      }),
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(100_001);
    expect(report.deferred.total).toBe(0);
  });

  it("a credit memo recognizes income the same way a payment does — paid by value, not new money", () => {
    const report = build({
      postings: [posting()],
      arDocuments: docs({
        "inv-1": { total_cents: 100_000, events: [{ date: "2026-04-02", amount_cents: 40_000 }] },
      }),
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(report.revenue.total).toBe(40_000);
  });

  it("an OVERPAYMENT recognizes the document and no more — it never invents income", () => {
    const report = build({
      postings: [posting()],
      arDocuments: docs({
        "inv-1": { total_cents: 100_000, events: [{ date: "2026-03-10", amount_cents: 150_000 }] },
      }),
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(100_000);
  });

  it("a BILL defers expense until it is paid, and recognizes pro rata when it is", () => {
    const report = build({
      postings: [
        posting({
          account_id: "acct-5000",
          account_code: "5000",
          account_name: "Fuel",
          account_type: "Expense",
          debit_or_credit: "debit",
          amount_cents: 60_000,
          source_transaction_type: "bill",
          source_transaction_id: "bill-1",
        }),
      ],
      apDocuments: docs({
        "bill-1": { total_cents: 60_000, events: [{ date: "2026-05-04", amount_cents: 20_000 }] },
      }),
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(report.operating_expenses.total).toBe(20_000);
    expect(report.deferred.total).toBe(40_000);
    expect(report.net_income).toBe(-20_000);
  });

  it("an AR posting whose document cannot be found is DISCLOSED, not recognized and not dropped", () => {
    const report = build({ postings: [posting({ source_transaction_id: "inv-missing" })] });
    expect(report.revenue.total).toBe(0);
    expect(report.undefined_proportion.total).toBe(100_000);
    expect(report.undefined_proportion.lines).toHaveLength(1);
    expect(report.net_income).toBe(0);
  });

  it("a cash event recognizes on its own GL date — QuickBooks' rule for non-AR/AP activity", () => {
    const inside = build({
      postings: [
        posting({
          source_transaction_type: "fuel_event",
          source_transaction_id: "fuel-1",
          account_type: "Expense",
          debit_or_credit: "debit",
          entry_date: "2026-06-15",
        }),
      ],
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(inside.operating_expenses.total).toBe(100_000);

    const outside = build({
      postings: [
        posting({
          source_transaction_type: "fuel_event",
          source_transaction_id: "fuel-1",
          account_type: "Expense",
          debit_or_credit: "debit",
          entry_date: "2026-07-15",
        }),
      ],
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(outside.operating_expenses.total).toBe(0);
    // The account keeps its row at zero rather than vanishing from the statement.
    expect(outside.operating_expenses.lines).toHaveLength(1);
  });

  it("@decision Q10 — a direct journal entry passes through both bases", () => {
    const report = build({
      postings: [posting({ source_transaction_type: "journal_entry", source_transaction_id: "je-1", entry_date: "2026-08-08" })],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(report.revenue.total).toBe(100_000);
    expect(report.basis_unresolved.total).toBe(0);
  });

  it("@decision Q5 — a driver settlement recognizes on the BANK SETTLEMENT DATE, not its period end", () => {
    const settlementPosting = posting({
      account_id: "acct-6100",
      account_code: "6100",
      account_name: "Driver Pay",
      account_type: "Expense",
      debit_or_credit: "debit",
      amount_cents: 250_000,
      source_transaction_type: "driver_settlement",
      source_transaction_id: "set-1",
      entry_date: "2026-09-27",
    });

    const paidInOctober = build({
      postings: [settlementPosting],
      driverSettlementDates: new Map([["set-1", "2026-10-02"]]),
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(paidInOctober.operating_expenses.total).toBe(0);
    expect(paidInOctober.deferred.total).toBe(250_000);

    const october = build({
      postings: [settlementPosting],
      driverSettlementDates: new Map([["set-1", "2026-10-02"]]),
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(october.operating_expenses.total).toBe(250_000);
    expect(october.deferred.total).toBe(0);
  });

  it("an unpaid driver settlement is deferred, never dropped", () => {
    const report = build({
      postings: [
        posting({
          account_type: "Expense",
          debit_or_credit: "debit",
          source_transaction_type: "driver_settlement",
          source_transaction_id: "set-2",
        }),
      ],
      driverSettlementDates: new Map([["set-2", null]]),
    });
    expect(report.operating_expenses.total).toBe(0);
    expect(report.deferred.total).toBe(100_000);
  });

  it("an UNKNOWN source type passes through AND is disclosed, so the default is visible", () => {
    const report = build({
      postings: [posting({ source_transaction_type: "some_new_poster", source_transaction_id: "x", entry_date: "2026-03-03" })],
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(100_000);
    expect(report.basis_unresolved.total).toBe(100_000);
    expect(report.recognition.by_treatment.unknown).toBe(1);
  });

  it("a posting with NO source type at all is treated as unknown and disclosed", () => {
    expect(treatCashBasisSource("")).toBe("unknown");
    expect(treatCashBasisSource(null)).toBe("unknown");
    expect(treatCashBasisSource(undefined)).toBe("unknown");
  });

  it("ACCT-F413 — a Balance Sheet account on the posting scan is dropped by name, not 'unclassified'", () => {
    const report = build({
      postings: [
        posting({ account_code: "1000", account_name: "Operating Cash", account_type: "Asset", debit_or_credit: "debit", source_transaction_type: "fuel_event" }),
        posting({ account_code: "2000", account_name: "Accounts Payable", account_type: "Liability", debit_or_credit: "credit", source_transaction_type: "bill_payment" }),
      ],
    });
    expect(report.unclassified.lines).toHaveLength(0);
    expect(report.revenue.lines).toHaveLength(0);
    expect(report.operating_expenses.lines).toHaveLength(0);
  });

  it("a genuinely unmapped account type DOES reach unclassified and is never folded into a total", () => {
    const report = build({
      postings: [
        posting({ account_code: "9999", account_name: "Mystery", account_type: "SomethingNew", debit_or_credit: "debit", source_transaction_type: "fuel_event", entry_date: "2026-03-03" }),
      ],
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.unclassified.total).toBe(100_000);
    expect(report.net_income).toBe(0);
  });

  it("revenue reads credit-positive and expense debit-positive, so a reversal reduces the right side", () => {
    const report = build({
      postings: [
        posting({ posting_id: "a", entry_date: "2026-03-01", source_transaction_type: "bank_categorization", source_transaction_id: "b1" }),
        posting({ posting_id: "b", debit_or_credit: "debit", amount_cents: 30_000, entry_date: "2026-03-02", source_transaction_type: "bank_categorization", source_transaction_id: "b2" }),
      ],
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(70_000);
  });

  it("gross profit and net income foot from the sections, not from a separate sum", () => {
    const report = build({
      postings: [
        posting({ posting_id: "r", entry_date: "2026-03-01", source_transaction_type: "bank_categorization", source_transaction_id: "r" }),
        posting({ posting_id: "c", account_code: "5100", account_name: "Purchased Transportation", account_type: "CostOfGoodsSold", debit_or_credit: "debit", amount_cents: 40_000, entry_date: "2026-03-02", source_transaction_type: "bank_categorization", source_transaction_id: "c" }),
        posting({ posting_id: "e", account_code: "6000", account_name: "Insurance", account_type: "Expense", debit_or_credit: "debit", amount_cents: 10_000, entry_date: "2026-03-03", source_transaction_type: "bank_categorization", source_transaction_id: "e" }),
      ],
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(report.revenue.total).toBe(100_000);
    expect(report.cogs.total).toBe(40_000);
    expect(report.gross_profit).toBe(60_000);
    expect(report.operating_expenses.total).toBe(10_000);
    expect(report.net_income).toBe(50_000);
  });

  it("every source type the posters write has a treatment — none falls through by accident", () => {
    // These are the types measured in apps/backend/src. A new poster adding a type will show up in
    // `basis_unresolved` at runtime, and this list is what makes the omission visible in CI.
    const written = [
      "bill", "invoice", "bill_payment", "expense", "customer_payment", "bank_categorization",
      "factoring_advance", "fuel_event", "transfer", "settlement", "driver_settlement",
      "driver_advance", "prepaid_purchase", "loan_payment", "driver_reimbursement", "cash_advance",
      "prepaid_amortization", "factoring_advance_deposit", "payment", "journal_entry",
      "factoring_reserve_release", "factoring_customer_payment", "period_close", "lease_rental",
      "finance_loan",
    ];
    const unclaimed = written.filter((type) => !(type in CASH_BASIS_SOURCE_TREATMENTS));
    expect(unclaimed).toEqual([]);
  });

  it("only invoice and bill defer — everything else is already cash", () => {
    const deferring = Object.entries(CASH_BASIS_SOURCE_TREATMENTS)
      .filter(([, treatment]) => treatment === "ar_document" || treatment === "ap_document")
      .map(([type]) => type)
      .sort();
    expect(deferring).toEqual(["bill", "invoice"]);
  });
});
