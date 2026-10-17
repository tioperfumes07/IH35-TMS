// Lead 04:10Z — a line-less expense posted manually gets ONE "Uncategorized" line on the role-resolved Uncategorized
// Expense account (QuickBooks behaviour). Before, the synthesized line had no account and the post was refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveRole } = vi.hoisted(() => ({ resolveRole: vi.fn() }));
vi.mock("../coa-roles/resolver.service.js", async (orig) => ({
  ...(await orig<typeof import("../coa-roles/resolver.service.js")>()),
  resolveRoleAccountOptional: resolveRole,
}));

const { writeUncategorizedLineInClientTx } = await import("../expense-writer.service.js");

const sql: Array<{ sql: string; values?: unknown[] }> = [];
const client = { query: vi.fn(async (q: string, values?: unknown[]) => { sql.push({ sql: q, values }); return { rows: [{ id: "line-1" }], rowCount: 1 }; }) };

describe("443.182 C / Lead 04:10Z — uncategorized line on the role-resolved account", () => {
  beforeEach(() => { sql.length = 0; resolveRole.mockReset(); });

  it("writes one Uncategorized line for the full amount on the uncategorized_expense role account", async () => {
    resolveRole.mockResolvedValue("acct-uncat");
    const account = await writeUncategorizedLineInClientTx(client, { operatingCompanyId: "oci", expenseId: "exp-1", amountCents: 4089 });
    expect(account).toBe("acct-uncat");
    expect(resolveRole).toHaveBeenCalledWith(client, "oci", "uncategorized_expense");
    const insert = sql.find((q) => /INSERT INTO accounting\.expense_lines/i.test(q.sql));
    expect(insert, "one expense_lines insert").toBeTruthy();
    expect(insert!.sql).toMatch(/expense_account_uuid/);
    expect(insert!.values).toEqual(expect.arrayContaining(["exp-1", 4089, 40.89, "Uncategorized", "acct-uncat"]));
  });

  it("an unmapped role writes nothing and returns null (the route refuses uncategorized_expense_role_unmapped)", async () => {
    resolveRole.mockResolvedValue(null);
    const account = await writeUncategorizedLineInClientTx(client, { operatingCompanyId: "oci", expenseId: "exp-1", amountCents: 4089 });
    expect(account).toBeNull();
    expect(sql.some((q) => /INSERT INTO accounting\.expense_lines/i.test(q.sql))).toBe(false);
  });
});
