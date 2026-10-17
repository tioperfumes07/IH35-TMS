import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => audit);

const { restampRelayFillExpenseUnit } = await import("../expense-attribution-restamp.service.js");

// LEAD 443.192 (ruling 11:40Z): EXP-2026-00009 (fill 067688c0, printed T163, leased to USMCA) takes T163;
// EXP-2026-00008 (fill e8784c8b, printed T169, operated by IH 35 Transportation) must NOT be stamped.
const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const T163 = "181b5c93-8bcf-4155-8a2e-ebc86f2a34e1";

function fakeClient(state: { unitResolved: string | null; fills?: string; headerStamped?: boolean }) {
  const sql: string[] = [];
  let stamped = state.headerStamped ?? false;
  const client = {
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (/FROM accounting\.expenses e/.test(q) && /relay_fuel_transactions r/.test(q)) {
        // The writer must use the same-company rule (operator = lessee, else owner) for the printed number.
        const sameCompanyRule = /COALESCE\(u2\.currently_leased_to_company_id, u2\.owner_company_id\) = r\.operating_company_id/.test(q);
        if (stamped) return { rows: [{ relay_fill_id: null, fills: "0", unit_id: null, before_unit: null }] };
        return { rows: [{ relay_fill_id: "067688c0", fills: state.fills ?? "1", unit_id: sameCompanyRule ? state.unitResolved : "WRONG-fleet-wide", before_unit: null }] };
      }
      if (/UPDATE accounting\.expenses/.test(q)) { stamped = true; return { rows: [], rowCount: 1 }; }
      if (/UPDATE accounting\.expense_lines/.test(q)) return { rows: [], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client, sql };
}

describe("restampRelayFillExpenseUnit (443.192)", () => {
  it("stamps the header + unit-less lines with the fill's same-company unit and audits once", async () => {
    audit.appendCrudAudit.mockClear();
    const { client, sql } = fakeClient({ unitResolved: T163 });
    const out = await restampRelayFillExpenseUnit(client as never, { operatingCompanyId: CO, actorUserId: "u1", expenseIds: ["exp-9"] });
    expect(out).toEqual([{ expense_id: "exp-9", outcome: "stamped", relay_fill_id: "067688c0", unit_id: T163, lines: 2 }]);
    expect(audit.appendCrudAudit).toHaveBeenCalledTimes(1);
    expect((audit.appendCrudAudit.mock.calls[0] as unknown[])[2]).toBe("expense.attribution_restamped_from_relay_fill");
    expect(sql.some((q) => /UPDATE accounting\.expense_lines SET unit_id = \$2::uuid WHERE expense_id = \$1::uuid AND unit_id IS NULL/.test(q))).toBe(true);
  });

  it("refuses — writes nothing — when the rule resolves no unit (printed unit operated by another company)", async () => {
    audit.appendCrudAudit.mockClear();
    const { client, sql } = fakeClient({ unitResolved: null });
    const out = await restampRelayFillExpenseUnit(client as never, { operatingCompanyId: CO, actorUserId: "u1", expenseIds: ["exp-8"] });
    expect(out[0]).toMatchObject({ expense_id: "exp-8", outcome: "refused" });
    expect(sql.some((q) => /^\s*UPDATE|INSERT/i.test(q))).toBe(false);
    expect(audit.appendCrudAudit).not.toHaveBeenCalled();
  });

  it("refuses a document that is not exactly one Relay fill's", async () => {
    const { client, sql } = fakeClient({ unitResolved: T163, fills: "2" });
    const out = await restampRelayFillExpenseUnit(client as never, { operatingCompanyId: CO, actorUserId: "u1", expenseIds: ["exp-x"] });
    expect(out[0]).toMatchObject({ outcome: "refused" });
    expect(sql.some((q) => /UPDATE/.test(q))).toBe(false);
  });

  it("never touches journal entries / postings, and a second run stamps nothing (idempotent)", async () => {
    const { client, sql } = fakeClient({ unitResolved: T163 });
    await restampRelayFillExpenseUnit(client as never, { operatingCompanyId: CO, actorUserId: "u1", expenseIds: ["exp-9"] });
    const second = await restampRelayFillExpenseUnit(client as never, { operatingCompanyId: CO, actorUserId: "u1", expenseIds: ["exp-9"] });
    expect(second[0]).toMatchObject({ outcome: "refused" });
    expect(sql.some((q) => /(UPDATE|INSERT INTO|DELETE FROM)\s+accounting\.journal_entr/i.test(q))).toBe(false);
    expect(sql.filter((q) => /UPDATE accounting\.expenses/.test(q))).toHaveLength(1);
  });
});
