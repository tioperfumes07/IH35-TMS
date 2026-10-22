import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  computeLateDeliveryPassthrough,
  computeDriverFinePassthrough,
  computeSettlementReimbursements,
  computeSettlementContractTerms,
} from "../settlement-contract-terms.service.js";


const OC = "0c000000-0000-0000-0000-000000000001";
const DRIVER = "d1000000-0000-0000-0000-000000000001";
const SETTLEMENT = "51000000-0000-0000-0000-000000000001";
const USER = "05500000-0000-0000-0000-000000000001";

/**
 * Mock DB client — dispatches by SQL substring. `handlers` is an ordered list of {match, rows}; the first
 * matching handler for each query wins and (if `once`) is consumed. Records every INSERT for assertions.
 */
function makeClient(handlers: Array<{ match: RegExp | string; rows: Record<string, unknown>[]; once?: boolean }>) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = [...handlers];
  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, values });
      const idx = pool.findIndex((h) => (typeof h.match === "string" ? sql.includes(h.match) : h.match.test(sql)));
      if (idx >= 0) {
        const h = pool[idx]!;
        if (h.once) pool.splice(idx, 1);
        return { rows: h.rows as T[], rowCount: h.rows.length };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  return { client, calls };
}

function insertsInto(calls: Array<{ sql: string; values?: unknown[] }>, table: string, lineType?: string) {
  return calls.filter(
    (c) => c.sql.includes(`INSERT INTO ${table}`) && (lineType ? String(c.values?.[1] ?? "").includes(lineType) || c.sql.includes(lineType) : true)
  );
}

beforeEach(() => {
  vi.mocked(appendCrudAudit).mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Pure boundary helpers
// ─────────────────────────────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 1 — MPG bonus service flow
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 2 — Referral bonus
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 3 — Late-delivery pass-through
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("computeLateDeliveryPassthrough", () => {
  const base = { settlementId: SETTLEMENT, driverId: DRIVER, operatingCompanyId: OC, actorUserId: USER };

  it("driver-fault chargeback => deduction with load_id", async () => {
    const { client, calls } = makeClient([
      { match: "customer_chargeback_driver_fault", rows: [{ id: "load1", load_number: "L-100", amount_cents: 25000, reason: "late 6h" }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.driver_settlement_deductions", rows: [{ id: "ded1", amount_cents: 25000, load_id: "load1", deduction_type: "other" }] },
    ]);
    const res = await computeLateDeliveryPassthrough(client, base);
    expect(res.appliedCount).toBe(1);
    expect(res.appliedCents).toBe(25000);
    const ded = insertsInto(calls, "driver_finance.driver_settlement_deductions");
    expect(ded).toHaveLength(1);
    expect(ded[0]!.values).toContain("load1"); // load_id passed direct
  });

  it("NOT driver-fault => query returns no rows => zero pass-through", async () => {
    // The SQL WHERE requires customer_chargeback_driver_fault = true, so a non-fault load yields no rows.
    const { client, calls } = makeClient([{ match: "customer_chargeback_driver_fault", rows: [] }]);
    const res = await computeLateDeliveryPassthrough(client, base);
    expect(res.appliedCount).toBe(0);
    expect(res.appliedCents).toBe(0);
    expect(insertsInto(calls, "driver_finance.driver_settlement_deductions")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 4 — Driver fines
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("computeDriverFinePassthrough", () => {
  const base = { settlementId: SETTLEMENT, driverId: DRIVER, operatingCompanyId: OC, actorUserId: USER };

  it("open driver fine => deduction + fine reverse-link", async () => {
    const { client, calls } = makeClient([
      {
        match: "FROM safety.civil_fines",
        rows: [{ id: "fine1", amount_cents: 15000, violation_description: "overweight", issued_by_authority: "TX DPS", related_load_id: "load9" }],
      },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.driver_settlement_deductions", rows: [{ id: "ded1", amount_cents: 15000 }] },
    ]);
    const res = await computeDriverFinePassthrough(client, base);
    expect(res.appliedCount).toBe(1);
    expect(res.appliedCents).toBe(15000);
    // reverse link: safety.civil_fines UPDATE ... driver_settlement_deduction_id
    expect(calls.some((c) => c.sql.includes("UPDATE") && c.sql.includes("safety.civil_fines") && c.sql.includes("driver_settlement_deduction_id"))).toBe(true);
  });

  it("no open fines (neither table) => nothing", async () => {
    const { client, calls } = makeClient([
      { match: "FROM safety.civil_fines", rows: [] },
      { match: "FROM safety.internal_fines", rows: [] },
    ]);
    const res = await computeDriverFinePassthrough(client, base);
    expect(res.appliedCount).toBe(0);
    expect(insertsInto(calls, "driver_finance.driver_settlement_deductions")).toHaveLength(0);
  });

  it("approved INTERNAL fine => deduction (dollars->cents) + converted_to_liability reverse-link", async () => {
    const { client, calls } = makeClient([
      { match: "FROM safety.civil_fines", rows: [] },
      {
        match: "FROM safety.internal_fines",
        // amount is numeric DOLLARS (250.00) -> 25000 cents; related_load_id carried onto the line.
        rows: [{ id: "if1", amount: 250.0, related_load_id: "load7", reason_name: "Dirty truck" }],
      },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c9" }] },
      { match: "INSERT INTO driver_finance.driver_settlement_deductions", rows: [{ id: "ded9", amount_cents: 25000 }] },
    ]);
    const res = await computeDriverFinePassthrough(client, base);
    expect(res.appliedCount).toBe(1);
    expect(res.appliedCents).toBe(25000);
    // reverse link + idempotency stamp: UPDATE safety.internal_fines ... converted_to_liability + driver_liability_id
    expect(
      calls.some(
        (c) =>
          c.sql.includes("UPDATE") &&
          c.sql.includes("safety.internal_fines") &&
          c.sql.includes("converted_to_liability") &&
          c.sql.includes("driver_liability_id")
      )
    ).toBe(true);
    // the contract line carries the load_id (driver->load->fine->deduction connectivity)
    const lineInsert = calls.find((c) => c.sql.includes("INSERT INTO driver_finance.settlement_contract_lines"));
    expect(lineInsert?.values).toContain("load7");
  });

  it("BOTH civil + internal fines => combined totals across both sub-sources", async () => {
    const { client } = makeClient([
      {
        match: "FROM safety.civil_fines",
        rows: [{ id: "cf1", amount_cents: 15000, violation_description: "overweight", issued_by_authority: "TX DPS", related_load_id: "load9" }],
      },
      {
        match: "FROM safety.internal_fines",
        rows: [{ id: "if1", amount: 100.0, related_load_id: "load9", reason_name: "Equipment damage" }],
      },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.driver_settlement_deductions", rows: [{ id: "ded1", amount_cents: 1 }] },
    ]);
    const res = await computeDriverFinePassthrough(client, base);
    expect(res.appliedCount).toBe(2);
    expect(res.appliedCents).toBe(15000 + 10000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 5 — Settlement-mode reimbursement pull
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("computeSettlementReimbursements", () => {
  const base = { settlementId: SETTLEMENT, driverId: DRIVER, operatingCompanyId: OC, actorUserId: USER };

  it("pending settlement-mode reimbursement => reimbursement line + marked settled", async () => {
    const { client, calls } = makeClient([
      { match: "FROM driver_finance.driver_reimbursements", rows: [{ id: "r1", amount_cents: 4200, reason: "toll", load_id: "load3", reimbursement_type: "toll" }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.settlement_lines", rows: [{ id: "sl1" }] },
    ]);
    const res = await computeSettlementReimbursements(client, base);
    expect(res.appliedCount).toBe(1);
    expect(res.appliedCents).toBe(4200);
    const lineInserts = insertsInto(calls, "driver_finance.settlement_lines");
    expect(lineInserts[0]!.sql).toContain("'reimbursement'"); // line_type is a SQL literal
    expect(lineInserts[0]!.values?.[2]).toBe(42); // dollars
    expect(calls.some((c) => c.sql.includes("SET status = 'settled'"))).toBe(true);
  });
});

// LEAD 443.236 (owner 10-22: "no you do not add automatically. for the moment there is not bonus") — the settlement close
// never computes or adds a bonus. Fails on the old engine: it read miles + gallons for the MPG bonus and audited the bonus.
describe("443.236 — no automatic bonus", () => {
  it("a settlement close with MPG well above 7.0 and an eligible referral writes NO bonus line and computes no bonus", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 900 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 100 }] },
      { match: "referred_by_driver_id", rows: [{ id: "ref1", first_name: "A", last_name: "B", hire_date: "2025-01-01" }] },
    ]);
    const r = await computeSettlementContractTerms(client, { settlementId: SETTLEMENT, driverId: DRIVER, operatingCompanyId: OC, actorUserId: USER });
    expect(Object.keys(r).sort()).toEqual(["fines", "lateDelivery", "reimbursements"]);
    expect(calls.some((c) => c.sql.includes("SUM(db.miles_basis)") || c.sql.includes("referred_by_driver_id") || c.sql.includes("settlement_contract_terms_config"))).toBe(false);
    expect(calls.some((c) => c.sql.includes("INSERT INTO driver_finance.settlement_lines") && c.sql.includes("'extra_pay'"))).toBe(false);
    expect(vi.mocked(appendCrudAudit).mock.calls.some((c) => String(c[2]).includes("bonus"))).toBe(false);
  });
});
