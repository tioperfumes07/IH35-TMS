import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateJe, mockResolveRole } = vi.hoisted(() => ({ mockCreateJe: vi.fn(), mockResolveRole: vi.fn() }));
vi.mock("../../accounting/journal-entries.service.js", () => ({ createJournalEntryOnClient: mockCreateJe }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRole }));

import { cashReserveReclassStatus, postCashReserveReclass } from "../cash-reserve-reclass.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function client(balance: string | null, live: Array<Record<string, string>> = [], bound = true) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("AS bound")) return { rows: [{ bound, cents: balance }] };
      if (sql.includes("FROM accounting.faro_cash_reserve_reclasses x")) return { rows: live };
      if (sql.includes("INSERT INTO accounting.faro_cash_reserve_reclasses")) return { rows: [{ id: "rc-1" }] };
      return { rows: [], rowCount: 1 };
    }),
  };
}

beforeEach(() => {
  let n = 0;
  mockCreateJe.mockReset().mockImplementation(async () => ({ id: `je-${++n}` }));
  mockResolveRole.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) => `acct:${role}`);
});

describe("Faro Cash Reserve deficit presents as Due to Faro", () => {
  it("status: positive balance = no deficit (complete); credit balance = due; matching reclass = complete; changed = stale", async () => {
    expect(await cashReserveReclassStatus(client("5000"), OPCO, "2026-09-30")).toMatchObject({ deficit_cents: 0, state: "no_deficit", complete: true });
    expect(await cashReserveReclassStatus(client("-51"), OPCO, "2026-09-30")).toMatchObject({ deficit_cents: 51, state: "due", complete: false });
    const live = [{ id: "rc-1", deficit_cents: "51", journal_entry_id: "je-1", reversal_journal_entry_id: "je-2" }];
    expect(await cashReserveReclassStatus(client("-51", live), OPCO, "2026-09-30")).toMatchObject({ state: "reclassed", complete: true });
    expect(await cashReserveReclassStatus(client("-60", live), OPCO, "2026-09-30")).toMatchObject({ state: "stale", complete: false });
  });

  it("posts DR 1235 / CR 2156 on the period end and the reversal the next day, both stamped to the reclass", async () => {
    const c = client("-51");
    const r = await postCashReserveReclass(c, { operating_company_id: OPCO, period_end: "2026-09-30", actor_user_id: "u", actor_role: "Accountant" });
    expect(r).toEqual({ reclass_id: "rc-1", deficit_cents: 51, journal_entry_id: "je-1", reversal_journal_entry_id: "je-2" });
    const [first, second] = mockCreateJe.mock.calls.map((x) => x[1]);
    expect(first.entry_date).toBe("2026-09-30");
    expect(first.postings.map((p: { account_id: string; debit_or_credit: string }) => `${p.debit_or_credit}:${p.account_id}`)).toEqual([
      "debit:acct:factor_cash_reserve_held",
      "credit:acct:factor_cash_reserve_deficit_payable",
    ]);
    expect(second.entry_date).toBe("2026-10-01");
    expect(second.postings.map((p: { account_id: string; debit_or_credit: string }) => `${p.debit_or_credit}:${p.account_id}`)).toEqual([
      "debit:acct:factor_cash_reserve_deficit_payable",
      "credit:acct:factor_cash_reserve_held",
    ]);
    expect(first.postings[0]).toMatchObject({ source_transaction_type: "faro_cash_reserve_reclass", source_transaction_id: "rc-1", amount_cents: 51 });
    expect(c.query.mock.calls[0]![0]).toContain("pg_advisory_xact_lock");
  });

  it("refuses with no deficit, when already reclassed, and when the register is unbound", async () => {
    await expect(postCashReserveReclass(client("10"), { operating_company_id: OPCO, period_end: "2026-09-30", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_cash_reserve_no_deficit");
    const live = [{ id: "rc-1", deficit_cents: "51", journal_entry_id: "je-1", reversal_journal_entry_id: "je-2" }];
    await expect(postCashReserveReclass(client("-51", live), { operating_company_id: OPCO, period_end: "2026-09-30", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_cash_reserve_already_reclassed");
    await expect(postCashReserveReclass(client(null, [], false), { operating_company_id: OPCO, period_end: "2026-09-30", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_cash_reserve_register_not_bound");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });

  it("year end rolls the reversal into the next year", async () => {
    await postCashReserveReclass(client("-51"), { operating_company_id: OPCO, period_end: "2026-12-31", actor_user_id: "u", actor_role: "Owner" });
    expect(mockCreateJe.mock.calls[1]![1].entry_date).toBe("2027-01-01");
  });
});
