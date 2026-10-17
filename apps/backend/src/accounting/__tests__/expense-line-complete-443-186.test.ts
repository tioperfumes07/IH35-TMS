/**
 * LEAD 443.186 — fail-old: the one expense-line INSERT wrote whatever its caller passed. CC-2's harness found work-order
 * lines with an item and no expense account, lumper split lines with no item, and seeded lines with a load and no
 * driver / unit. Now insertExpenseLine completes a line from evidence on its own document (header, item); the
 * re-stamp engine fills old rows from the load already on them. Synthetic ids only.
 */
import { describe, expect, it } from "vitest";
import { completeExpenseLine, insertExpenseLine } from "../expense-writer.service.js";
import { restampExpenseAttributionFromLoad } from "../expense-attribution-restamp.service.js";

const CO = "00000000-0000-4000-8000-000000000001";
const HDR = { co: CO, d: "drv-1", u: "unit-1", t: "trl-1", l: "load-1" };

function client(hdr: typeof HDR | null, itemAccount: string | null = null) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (/FROM accounting\.expenses WHERE id = \$1::uuid/.test(sql)) return { rows: hdr ? [hdr] : [] };
      if (/FROM catalogs\.items WHERE id = \$1::uuid/.test(sql)) return { rows: itemAccount ? [{ a: itemAccount }] : [] };
      if (/INSERT INTO accounting\.expense_lines/.test(sql)) return { rows: [{ id: "line-1" }] };
      return { rows: [], rowCount: 1 };
    },
  };
}

describe("insertExpenseLine completes a line from its own document (443.186)", () => {
  it("company + driver/unit/trailer from the header when the line is on the header's load; account from the item", async () => {
    const c = client(HDR, "acct-5310");
    const row = await completeExpenseLine(c, { expense_id: "exp-1", load_id: "load-1", item_id: "item-1", amount_cents: 100 });
    expect(row).toMatchObject({ operating_company_id: CO, driver_id: "drv-1", unit_id: "unit-1", trailer_id: "trl-1", expense_account_uuid: "acct-5310" });
  });

  it("a value the caller passed wins; a line on ANOTHER load takes no attribution from the header", async () => {
    const c = client(HDR, "acct-item");
    expect(await completeExpenseLine(c, { expense_id: "exp-1", load_id: "load-1", driver_id: "drv-x", expense_account_uuid: "acct-x", item_id: "i" }))
      .toMatchObject({ driver_id: "drv-x", unit_id: "unit-1", expense_account_uuid: "acct-x" });
    const other = await completeExpenseLine(client(HDR), { expense_id: "exp-1", load_id: "load-2" });
    expect(other.driver_id).toBeUndefined();
    expect(other.unit_id).toBeUndefined();
  });

  it("no item = no account from here (never guessed); the INSERT carries the completed columns", async () => {
    const c = client(HDR, "acct-item");
    expect((await completeExpenseLine(c, { expense_id: "exp-1" })).expense_account_uuid).toBeUndefined();
    await insertExpenseLine(c, { expense_id: "exp-1", load_id: "load-1", amount_cents: 100 });
    const ins = c.calls.find((x) => /INSERT INTO accounting\.expense_lines/.test(x.sql))!;
    expect(ins.sql).toMatch(/driver_id/);
    expect(ins.sql).toMatch(/unit_id/);
    expect(ins.sql).toMatch(/operating_company_id/);
  });
});

describe("restampExpenseAttributionFromLoad (443.186 re-stamp)", () => {
  it("header from the load (fill-null, same company), then its lines from the header; audited; no money", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const c = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (/UPDATE accounting\.expenses e/.test(sql)) return { rows: [{ expense_id: "exp-1", load_id: "load-1", driver_id: "drv-1", unit_id: "unit-1" }] };
        if (/UPDATE accounting\.expense_lines el/.test(sql)) return { rows: [], rowCount: 2 };
        return { rows: [] };
      },
    };
    const out = await restampExpenseAttributionFromLoad(c as never, { operatingCompanyId: CO, actorUserId: "actor", expenseIds: ["exp-1"] });
    expect(out).toEqual([{ expense_id: "exp-1", load_id: "load-1", driver_id: "drv-1", unit_id: "unit-1", lines: 2 }]);
    const hdr = calls[0]!.sql;
    expect(hdr).toMatch(/COALESCE\(e\.driver_uuid,/);
    expect(hdr).toMatch(/d\.operating_company_id = l\.operating_company_id/);
    expect(hdr).toMatch(/lu_u\.owner_company_id = lu_l\.operating_company_id/);
    expect(hdr).not.toMatch(/total_amount|amount_cents|expense_account|journal/);
    expect(calls.filter((x) => /audit\.append_event/.test(x.sql))).toHaveLength(1);
  });
});
