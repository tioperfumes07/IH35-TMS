import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../expense-writer.service.js", () => ({
  relinkExpenseToLoadInClientTx: vi.fn(async () => ({ number: "13700-3" })),
}));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));

import { linkExpenseChildToParentInClientTx, moveExpenseFamilyToLoad } from "../reclassify.service.js";
import { relinkExpenseToLoadInClientTx } from "../../expense-writer.service.js";
import { writeTransactionSourceLink } from "../../accounting-spine-emit.js";

const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";
type Call = { sql: string; values: unknown[] };

/** A scripted client: each handler answers the first SQL it matches; every call is recorded. */
function client(handlers: Array<[RegExp, (values: unknown[]) => unknown[]]>) {
  const calls: Call[] = [];
  return {
    calls,
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      const h = handlers.find(([re]) => re.test(sql));
      const rows = h ? h[1](values) : [];
      return { rows, rowCount: rows.length };
    },
  };
}

describe("OWNER RULING 443.288-A — a statement card difference is linked to its receipt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps parent_expense_id and writes the spine role on every posting of the child's journal entry", async () => {
    const c = client([
      [/UPDATE accounting\.expenses SET parent_expense_id/, () => [{ parent: "receipt-1" }]],
      [/FROM accounting\.journal_entry_postings p\s+WHERE p\.operating_company_id = \$1::uuid AND p\.journal_entry_uuid/, () => [{ id: "post-a" }, { id: "post-b" }]],
    ]);
    await linkExpenseChildToParentInClientTx(c as never, { operatingCompanyId: OC, childExpenseId: "child-1", parentExpenseId: "receipt-1", journalEntryId: "je-1", role: "statement_card_difference_of" });
    expect(c.calls[0]!.values).toEqual(["child-1", OC, "receipt-1"]);
    expect(vi.mocked(writeTransactionSourceLink).mock.calls.map(([, o]) => o)).toEqual([
      { operating_company_id: OC, journal_entry_posting_id: "post-a", linked_object_type: "expense", linked_object_id: "receipt-1", relationship_role: "statement_card_difference_of" },
      { operating_company_id: OC, journal_entry_posting_id: "post-b", linked_object_type: "expense", linked_object_id: "receipt-1", relationship_role: "statement_card_difference_of" },
    ]);
  });

  it("refuses to re-parent a child that already names another receipt, and a self-parent", async () => {
    const c = client([[/UPDATE accounting\.expenses SET parent_expense_id/, () => [{ parent: "receipt-OTHER" }]]]);
    await expect(linkExpenseChildToParentInClientTx(c as never, { operatingCompanyId: OC, childExpenseId: "child-1", parentExpenseId: "receipt-1", journalEntryId: "je-1", role: "statement_card_difference_of" }))
      .rejects.toThrow("expense_family_parent_conflict");
    await expect(linkExpenseChildToParentInClientTx(c as never, { operatingCompanyId: OC, childExpenseId: "x", parentExpenseId: "x", journalEntryId: "je-1", role: "statement_card_difference_of" }))
      .rejects.toThrow("expense_family_self_parent");
    expect(writeTransactionSourceLink).not.toHaveBeenCalled();
  });
});

describe("OWNER RULING 443.288-A — moveExpenseFamilyToLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves every live child that is not already on the target: document header, lines, load link and audit follow", async () => {
    const c = client([
      [/FROM accounting\.expenses c\s+WHERE c\.operating_company_id = \$1::uuid AND c\.parent_expense_id = ANY/, () => [{ id: "child-1", expense_number: "13600-2", load_id: "load-old", parent: "receipt-1" }]],
      // no live posting off the target (e.g. an unposted child) -> no reclassify, the document still follows
      [/FROM accounting\.journal_entry_postings p\s+JOIN accounting\.journal_entries je/, () => []],
      [/FROM expense_attribution\.expense_load_links/, () => [{ id: "link-1" }]],
    ]);
    const r = await moveExpenseFamilyToLoad(c as never, { operatingCompanyId: OC, actorUserId: "owner", parentExpenseIds: ["receipt-1", "receipt-1"], toLoadId: "load-new", reason: "receipt moved" });
    expect(r).toEqual({ children_moved: 1 });
    const select = c.calls.find((x) => /c\.parent_expense_id = ANY/.test(x.sql))!;
    expect(select.sql).toMatch(/c\.voided_at IS NULL\s+AND c\.load_id IS DISTINCT FROM \$3::uuid/);
    expect(select.values).toEqual([OC, ["receipt-1"], "load-new"]);
    expect(vi.mocked(relinkExpenseToLoadInClientTx).mock.calls[0]![1]).toMatchObject({ expenseId: "child-1", loadId: "load-new", existingLinkId: "link-1", priorNumber: "13600-2" });
    const header = c.calls.find((x) => /UPDATE accounting\.expenses SET load_id = \$3::uuid, expense_number = \$4/.test(x.sql))!;
    expect(header.values).toEqual(["child-1", OC, "load-new", "13700-3"]);
    expect(c.calls.some((x) => /UPDATE accounting\.expense_lines SET load_id = \$3::uuid/.test(x.sql))).toBe(true);
    const audit = c.calls.find((x) => /accounting\.expense_family\.child_followed_parent/.test(x.sql))!;
    expect(JSON.parse(String(audit.values[0]))).toMatchObject({ child_expense_id: "child-1", parent_expense_id: "receipt-1", from_load_id: "load-old", to_load_id: "load-new" });
    expect(c.calls.some((x) => /UPDATE accounting\.journal_entry_postings/.test(x.sql))).toBe(false);
  });

  it("does nothing for a receipt with no children (and no parents)", async () => {
    const c = client([]);
    expect(await moveExpenseFamilyToLoad(c as never, { operatingCompanyId: OC, actorUserId: "owner", parentExpenseIds: [], toLoadId: "load-new", reason: "x" })).toEqual({ children_moved: 0 });
    expect(c.calls).toHaveLength(0);
    const c2 = client([]);
    expect(await moveExpenseFamilyToLoad(c2 as never, { operatingCompanyId: OC, actorUserId: "owner", parentExpenseIds: ["receipt-1"], toLoadId: "load-new", reason: "x" })).toEqual({ children_moved: 0 });
    expect(c2.calls).toHaveLength(1);
  });
});
