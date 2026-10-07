import { describe, expect, it, vi } from "vitest";

// ROUND 441.5 — the one writer of an expense paid straight from a bank line, and its item rule (every expense line names
// an item, expense_lines_item_id_required): the operator's item, else the ONE item mapped to the account; none or
// several are refused by name, never guessed.

const nextExpenseDisplayId = vi.fn(async () => "EXP-2026-00042");
const postSourceTransactionInClientTx = vi.fn(async () => ({ journal_entry_id: "je-1", posting_batch_id: "pb-1" }));
vi.mock("../display-id.js", () => ({ nextExpenseDisplayId }));
vi.mock("../posting-engine.service.js", () => ({ postSourceTransactionInClientTx }));

const { resolveExpenseItemForAccount, createAndPostBankLineExpenseOnClient, BankLineExpenseError } = await import(
  "../bank-line-expense.service.js"
);

const CO = "11111111-1111-4111-8111-111111111111";

function itemsClient(mapped: Array<{ id: string; item_name: string }>, explicitOk = true) {
  return {
    query: vi.fn(async (text: string) => {
      if (/WHERE id = \$1::uuid AND operating_company_id/.test(text)) return { rows: explicitOk ? [{ id: "item-x" }] : [] };
      return { rows: mapped };
    }),
  };
}

describe("resolveExpenseItemForAccount", () => {
  it("uses the ONE item mapped to the account", async () => {
    await expect(resolveExpenseItemForAccount(itemsClient([{ id: "i1", item_name: "BC-NSF Fee" }]) as never, { operatingCompanyId: CO, accountId: "a" })).resolves.toBe("i1");
  });
  it("refuses an account with no item, naming the account", async () => {
    const p = resolveExpenseItemForAccount(itemsClient([]) as never, { operatingCompanyId: CO, accountId: "a", accountLabel: "6900 Miscellaneous" });
    await expect(p).rejects.toBeInstanceOf(BankLineExpenseError);
    await expect(p).rejects.toThrow("6900 Miscellaneous");
  });
  it("refuses several items, listing them, never picks one", async () => {
    const p = resolveExpenseItemForAccount(
      itemsClient([{ id: "i1", item_name: "BC-Bank Ach & Wire Fees" }, { id: "i2", item_name: "BC-NSF Fee" }]) as never,
      { operatingCompanyId: CO, accountId: "a" }
    );
    await expect(p).rejects.toThrow(/2 items .*BC-Bank Ach & Wire Fees, BC-NSF Fee/);
  });
  it("takes the operator's item when it is this company's", async () => {
    await expect(resolveExpenseItemForAccount(itemsClient([], true) as never, { operatingCompanyId: CO, accountId: "a", explicitItemId: "item-x" })).resolves.toBe("item-x");
  });
  it("refuses an operator item from another company", async () => {
    await expect(resolveExpenseItemForAccount(itemsClient([], false) as never, { operatingCompanyId: CO, accountId: "a", explicitItemId: "item-x" })).rejects.toThrow("not an active item");
  });
});

describe("createAndPostBankLineExpenseOnClient", () => {
  it("inserts the document and its line, posts through the expense poster, stamps posted — on the caller's client", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        if (/INSERT INTO accounting\.expenses/.test(text)) return { rows: [{ id: "exp-1" }] };
        return { rows: [] };
      }),
    };
    const out = await createAndPostBankLineExpenseOnClient(
      client as never,
      {
        operatingCompanyId: CO,
        transactionDate: "2026-08-18",
        amountCents: 14614,
        memo: "ED-HER PLASTICS",
        vendorId: "v-edher",
        paymentAccountId: "acct-1000",
        expenseAccountId: "acct-6900",
        itemId: "item-misc",
        lineDescription: "ED-HER PLASTICS",
        sourceBankTransactionId: "bt-1",
      },
      { userId: "u-1" }
    );
    expect(out).toEqual({ expense_id: "exp-1", journal_entry_id: "je-1", posting_batch_id: "pb-1" });
    const header = calls.find((c) => /INSERT INTO accounting\.expenses/.test(c.text))!;
    expect(header.values).toEqual([CO, "2026-08-18", 14614, "ED-HER PLASTICS", "EXP-2026-00042", "v-edher", "acct-1000", "bt-1", null, null, null, null, "u-1"]);
    const line = calls.find((c) => /INSERT INTO accounting\.expense_lines/.test(c.text))!;
    expect(line.values?.slice(0, 7)).toEqual([CO, "exp-1", 146.14, 14614, "ED-HER PLASTICS", "acct-6900", "item-misc"]);
    expect(postSourceTransactionInClientTx).toHaveBeenCalledWith(
      client,
      { operating_company_id: CO, source_transaction_type: "expense", source_transaction_id: "exp-1" },
      { userId: "u-1" }
    );
    expect(calls.some((c) => /SET status = 'posted', posting_status = 'posted'/.test(c.text))).toBe(true);
  });
});
