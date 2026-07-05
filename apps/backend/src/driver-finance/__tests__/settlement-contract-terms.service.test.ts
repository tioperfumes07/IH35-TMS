import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  computeMpg,
  mpgBonusQualifies,
  referralEligibleAsOf,
  computeSettlementMpgBonus,
  computeReferralBonuses,
  computeLateDeliveryPassthrough,
  computeDriverFinePassthrough,
  computeSettlementReimbursements,
  type ContractTermsConfig,
} from "../settlement-contract-terms.service.js";

const CONFIG: ContractTermsConfig = {
  mpgThreshold: 7.0,
  mpgBonusCents: 3500,
  referralRewardCents: 20000,
  referralMinDays: 30,
};

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
describe("computeMpg / mpgBonusQualifies — MPG boundary", () => {
  it("exactly 7.0 mpg does NOT qualify (strictly greater)", () => {
    const { mpg, sourceAbsent } = computeMpg(700, 100);
    expect(sourceAbsent).toBe(false);
    expect(mpg).toBe(7.0);
    expect(mpgBonusQualifies(mpg, 7.0)).toBe(false);
  });

  it("just above 7.0 qualifies", () => {
    const { mpg } = computeMpg(701, 100);
    expect(mpgBonusQualifies(mpg, 7.0)).toBe(true);
  });

  it("fails loud when the fuel/miles source is absent (no silent zero)", () => {
    expect(computeMpg(700, 0).sourceAbsent).toBe(true);
    expect(computeMpg(0, 100).sourceAbsent).toBe(true);
    expect(computeMpg(0, 100).mpg).toBeNull();
  });

  it("owner override supplies MPG even when the source is absent", () => {
    const { mpg, sourceAbsent } = computeMpg(0, 0, 8.5);
    expect(sourceAbsent).toBe(false);
    expect(mpg).toBe(8.5);
    expect(mpgBonusQualifies(mpg, 7.0)).toBe(true);
  });
});

describe("referralEligibleAsOf — 29 vs 30 days boundary", () => {
  const asOf = new Date("2026-07-05T12:00:00.000Z");
  it("29 days worked => NOT eligible", () => {
    // hired 2026-06-06 => 29 days before 2026-07-05
    expect(referralEligibleAsOf("2026-06-06", 30, asOf)).toBe(false);
  });
  it("30 days worked => eligible", () => {
    // hired 2026-06-05 => 30 days before 2026-07-05
    expect(referralEligibleAsOf("2026-06-05", 30, asOf)).toBe(true);
  });
  it("null hire date => not eligible", () => {
    expect(referralEligibleAsOf(null, 30, asOf)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 1 — MPG bonus service flow
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("computeSettlementMpgBonus", () => {
  const base = { settlementId: SETTLEMENT, driverId: DRIVER, operatingCompanyId: OC, actorUserId: USER, config: CONFIG };

  it("MPG exactly 7.0 => no bonus, no extra_pay line", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 700 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 100 }] },
    ]);
    const res = await computeSettlementMpgBonus(client, base);
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.reason).toBe("below_threshold");
    expect(insertsInto(calls, "driver_finance.settlement_lines")).toHaveLength(0);
  });

  it("MPG > 7.0 => $35 extra_pay line + provenance", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 750 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 100 }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.settlement_lines", rows: [{ id: "sl1" }] },
    ]);
    const res = await computeSettlementMpgBonus(client, base);
    expect(res.applied).toBe(true);
    if (res.applied) {
      expect(res.bonusCents).toBe(3500);
      expect(res.mpg).toBeCloseTo(7.5, 5);
    }
    const lineInserts = insertsInto(calls, "driver_finance.settlement_lines");
    expect(lineInserts).toHaveLength(1);
    expect(lineInserts[0]!.values?.[2]).toBe(35); // dollars
  });

  it("source absent => fail-loud audit, no bonus", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 750 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 0 }] },
    ]);
    const res = await computeSettlementMpgBonus(client, base);
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.reason).toBe("mpg_source_absent");
    expect(appendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      "driver_finance.settlement.mpg_source_absent",
      expect.any(Object),
      "warning",
      expect.any(String)
    );
    expect(insertsInto(calls, "driver_finance.settlement_lines")).toHaveLength(0);
  });

  it("owner override forces compute when source absent", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 0 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 0 }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.settlement_lines", rows: [{ id: "sl1" }] },
    ]);
    const res = await computeSettlementMpgBonus(client, { ...base, mpgOverride: 9 });
    expect(res.applied).toBe(true);
    expect(insertsInto(calls, "driver_finance.settlement_lines")).toHaveLength(1);
  });

  it("idempotent — provenance conflict (no id) => no second line", async () => {
    const { client, calls } = makeClient([
      { match: "SUM(db.miles_basis)", rows: [{ miles: 750 }] },
      { match: "SUM(ft.gallons)", rows: [{ gallons: 100 }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [] }, // ON CONFLICT DO NOTHING
    ]);
    const res = await computeSettlementMpgBonus(client, base);
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.reason).toBe("already_applied");
    expect(insertsInto(calls, "driver_finance.settlement_lines")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 2 — Referral bonus
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("computeReferralBonuses", () => {
  const base = { settlementId: SETTLEMENT, referrerDriverId: DRIVER, operatingCompanyId: OC, actorUserId: USER, config: CONFIG };
  const yesterdayIso = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString().slice(0, 10); // 40 days ago

  it("referred driver worked >= 30 days => $200 line + stamp", async () => {
    const { client, calls } = makeClient([
      { match: "referred_by_driver_id", rows: [{ id: "ref1", first_name: "Juan", last_name: "Perez", hire_date: yesterdayIso }] },
      { match: "INSERT INTO driver_finance.settlement_contract_lines", rows: [{ id: "c1" }] },
      { match: "INSERT INTO driver_finance.settlement_lines", rows: [{ id: "sl1" }] },
    ]);
    const res = await computeReferralBonuses(client, base);
    expect(res.appliedCount).toBe(1);
    expect(res.appliedCents).toBe(20000);
    expect(res.referredDriverIds).toEqual(["ref1"]);
    const lineInserts = insertsInto(calls, "driver_finance.settlement_lines");
    expect(lineInserts[0]!.values?.[2]).toBe(200); // dollars
    // idempotency stamp update
    expect(calls.some((c) => c.sql.includes("SET referral_reward_paid_at = now()"))).toBe(true);
  });

  it("referred driver at 29 days (edge row) => skipped by the day guard", async () => {
    const day29 = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { client, calls } = makeClient([
      { match: "referred_by_driver_id", rows: [{ id: "ref1", first_name: "A", last_name: "B", hire_date: day29 }] },
    ]);
    const res = await computeReferralBonuses(client, base);
    expect(res.appliedCount).toBe(0);
    expect(insertsInto(calls, "driver_finance.settlement_lines")).toHaveLength(0);
  });

  it("no referrals => nothing", async () => {
    const { client } = makeClient([{ match: "referred_by_driver_id", rows: [] }]);
    const res = await computeReferralBonuses(client, base);
    expect(res.appliedCount).toBe(0);
  });
});

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
