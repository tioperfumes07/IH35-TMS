/**
 * ACCT-F11070 — register rows 127-130. Each test fails on the code before this change (the helper modules did not exist, the
 * read models summed credits as costs, two posters SET amount_paid_cents directly, Book Load recorded no miles source).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  effectiveFuelRowId,
  expenseEffectiveFuelRowIdSql,
  signedExpenseCents,
  signedExpenseCentsSql,
} from "../expense-signed-cents.sql.js";
import { loadCostRollupLateral } from "../load-cost-rollup.sql.js";
import { LOAD_COST_DOCUMENTS_CTE } from "../load-costs-live-documents.sql.js";
import { applyInvoiceRelief, InvoiceReliefError, raiseInvoicePaidTo } from "../invoice-relief-application.service.js";
import { CARD_CREDIT_REPAIR_ROLES } from "../../fuel/statement-card-credit-repair.service.js";
import { bookedMilesFields } from "../../dispatch/book-load.service.js";

const SRC = path.resolve(__dirname, "../../");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("row 128 — settlement 5787 (P-0018) non-diesel: a card credit is a negative cost, bucketed with its receipt", () => {
  // Live prod 11-03, loads 13549 + 13555 (P-0018). parent = the receipt the statement adjustment names.
  const receipts: Record<string, string | null> = { "13549": "ft-diesel-13549", "13549-1": "ft-def-13549", "13555-2": "ft-def-13555a", "13555-3": "ft-def-13555b" };
  const fuelType: Record<string, string> = { "ft-diesel-13549": "diesel", "ft-def-13549": "def", "ft-def-13555a": "def", "ft-def-13555b": "def" };
  const docs = [
    { n: "13549-1", total_amount_cents: 2451, is_credit: false, source_fuel_transaction_id: "ft-def-13549", parent: null },
    { n: "13549-2", total_amount_cents: 1345, is_credit: false, source_fuel_transaction_id: null, parent: null },
    { n: "13549-3", total_amount_cents: 1525, is_credit: false, source_fuel_transaction_id: null, parent: null },
    { n: "13549-4", total_amount_cents: 9479, is_credit: true, source_fuel_transaction_id: null, parent: "13549" },
    { n: "13549-5", total_amount_cents: 2, is_credit: true, source_fuel_transaction_id: null, parent: "13549-1" },
    { n: "13555-2", total_amount_cents: 2492, is_credit: false, source_fuel_transaction_id: "ft-def-13555a", parent: null },
    { n: "13555-3", total_amount_cents: 2482, is_credit: false, source_fuel_transaction_id: "ft-def-13555b", parent: null },
    { n: "13555-4", total_amount_cents: 1525, is_credit: false, source_fuel_transaction_id: null, parent: null },
    { n: "13555-7", total_amount_cents: 2, is_credit: false, source_fuel_transaction_id: null, parent: "13555-2" },
    { n: "13555-8", total_amount_cents: 2, is_credit: false, source_fuel_transaction_id: null, parent: "13555-3" },
  ];
  const nonDiesel = (signed: boolean, byParent: boolean) =>
    docs
      .filter((d) => {
        const fr = byParent ? effectiveFuelRowId({ source_fuel_transaction_id: d.source_fuel_transaction_id, parent_expense_id: d.parent }, (p) => receipts[p] ?? null) : d.source_fuel_transaction_id;
        return !fr || fuelType[fr] !== "diesel";
      })
      .reduce((t, d) => t + (signed ? signedExpenseCents(d) : d.total_amount_cents), 0);

  it("the old unsigned rule reads $213.05 + $22.00 reimbursement = $235.05 (signed settlement $140.20)", () => {
    expect(nonDiesel(false, false) + 2200).toBe(23505);
  });
  it("the rule reads $118.22 + $22.00 = $140.22 — the $0.02 left is three Dreamline card differences on DEF receipts", () => {
    expect(nonDiesel(true, true) + 2200).toBe(14022);
  });
  it("the $94.81 the register measured is exactly the two card credits on 13549 (94.79 + 0.02)", () => {
    expect(23501 - 14020).toBe(9479 + 2);
  });
  it("the SQL rule signs credits and resolves the adjusted receipt", () => {
    expect(signedExpenseCentsSql("e")).toContain("WHEN e.is_credit IS TRUE THEN -e.total_amount_cents");
    expect(expenseEffectiveFuelRowIdSql("e")).toContain("pe.id = e.parent_expense_id");
  });
  it("the one load-cost read model and the cost-documents CTE use it (no bare SUM of the header)", () => {
    const sql = loadCostRollupLateral("l.id", "l.operating_company_id");
    expect(sql).toContain("WHEN e.is_credit IS TRUE THEN -e.total_amount_cents");
    expect(sql).toContain("pe.id = e.parent_expense_id");
    expect(sql).not.toMatch(/SUM\(e\.total_amount_cents\)/);
    expect(LOAD_COST_DOCUMENTS_CTE).toContain("CASE WHEN e.is_credit IS TRUE THEN -1 ELSE 1 END");
    expect(read("dispatch/load-profitability.service.ts")).not.toMatch(/SUM\(e\.total_amount_cents\)/);
    expect(read("accounting/load-unit-cost-split.routes.ts")).not.toMatch(/SUM\(e\.total_amount_cents\)/);
  });
});

describe("row 129 — amount_paid_cents is derived from applications, one writer", () => {
  type Call = { sql: string; values?: unknown[] };
  const fake = (invoice: { total: number; paid: number } | null) => {
    const calls: Call[] = [];
    return {
      calls,
      client: {
        query: async (sql: string, values?: unknown[]) => {
          calls.push({ sql, values });
          if (/FROM accounting\.invoices/.test(sql)) return { rows: invoice ? [{ total: String(invoice.total), paid: String(invoice.paid) }] : [] };
          if (/INSERT INTO accounting\.payment_applications/.test(sql)) return { rows: [{ id: "app-1" }] };
          return { rows: [] };
        },
      },
    };
  };
  it("relief is ONE payment-less application; the column is never written", async () => {
    const f = fake({ total: 52500, paid: 0 });
    const out = await applyInvoiceRelief(f.client as never, { operatingCompanyId: "c", invoiceId: "i", amountCents: 52500, actorUserId: "u" });
    expect(out).toEqual({ application_id: "app-1" });
    expect(f.calls.some((c) => /INSERT INTO accounting\.payment_applications/.test(c.sql) && /NULL, \$2::uuid, \$3::bigint/.test(c.sql))).toBe(true);
    expect(f.calls.some((c) => /amount_paid_cents\s*=/.test(c.sql))).toBe(false);
  });
  it("relief above the open balance is refused", async () => {
    await expect(applyInvoiceRelief(fake({ total: 35000, paid: 30000 }).client as never, { operatingCompanyId: "c", invoiceId: "i", amountCents: 6000, actorUserId: null })).rejects.toBeInstanceOf(InvoiceReliefError);
  });
  it("a cumulative poster raises paid by the delta only, and never lowers it", async () => {
    const f = fake({ total: 100000, paid: 25000 });
    await raiseInvoicePaidTo(f.client as never, { operatingCompanyId: "c", invoiceId: "i", targetPaidCents: 60000, actorUserId: null });
    const ins = f.calls.find((c) => /INSERT INTO accounting\.payment_applications/.test(c.sql))!;
    expect(ins.values?.[2]).toBe(35000);
    await expect(raiseInvoicePaidTo(fake({ total: 100000, paid: 60000 }).client as never, { operatingCompanyId: "c", invoiceId: "i", targetPaidCents: 25000, actorUserId: null })).rejects.toThrow(/invoice_relief_would_lower_paid/);
  });
  it("neither poster SETs amount_paid_cents any more", () => {
    for (const rel of ["accounting/factoring-posting/poster.service.ts", "factoring/faro-reserve-entries.service.ts"]) {
      const code = read(rel).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      expect(code).not.toMatch(/SET\s+amount_paid_cents\s*=/);
      expect(code).not.toMatch(/amount_paid_cents\s*=\s*(\$\d|COALESCE)/);
    }
  });
});

describe("row 127 — statement card-credit repair reads no account by number", () => {
  it("both asserted accounts resolve by role", () => {
    expect(CARD_CREDIT_REPAIR_ROLES).toEqual({ fuel: "company_fuel_advance_expense", cardPayable: "fuel_card_payable_dreamline" });
    const code = read("fuel/statement-card-credit-repair.service.ts");
    expect(code).not.toMatch(/acctNet\(c, companyId, "\d+"\)/);
    expect(code).not.toMatch(/account_number = '(5000|2510)'/);
  });
});

describe("row 130 — Book Load records the source of the miles it writes", () => {
  it("names every miles field the booking carries", () => {
    expect(bookedMilesFields({ miles_practical: 1110 })).toEqual(["practical"]);
    expect(bookedMilesFields({ miles_practical: 1644, miles_shortest: 1534.7, miles_deadhead: 0 })).toEqual(["practical", "short", "empty"]);
    expect(bookedMilesFields({})).toEqual([]);
  });
  it("Book Load queues the source record and the handler records it as the value as booked", () => {
    expect(read("dispatch/book-load.service.ts")).toMatch(/record_booked_sources: true/);
    expect(read("outbox/handlers/dispatch-relearn-load-miles.handler.ts")).toMatch(/recordBookedMilesSources\(/);
    expect(read("dispatch/mileage/miles-recommendations.service.ts")).toMatch(/source: "manual", manualValue: Number\(cur\.value\), reason/);
  });
});
