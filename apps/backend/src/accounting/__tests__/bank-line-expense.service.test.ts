import { describe, expect, it, vi } from "vitest";


/** 443.182 C — rows go through the one expense writer's INSERT; read a value by column name, not by position. */
function col(call: { text: string; values?: unknown[] }, name: string): unknown {
  const m = /\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*(?:RETURNING[\s\S]*)?$/.exec(call.text.trim());
  if (!m) throw new Error(`not an INSERT: ${call.text.slice(0, 80)}`);
  const cols = m[1]!.split(",").map((c) => c.trim());
  const vals = m[2]!.split(",").map((v) => v.trim());
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`column ${name} not written`);
  const v = vals[i]!;
  return /^\$\d+$/.test(v) ? call.values?.[Number(v.slice(1)) - 1] : v;
}

// ROUND 441.5 — the one writer of an expense paid straight from a bank line, and its item rule (every expense line names
// an item, expense_lines_item_id_required): the operator's item, else the ONE item mapped to the account; none or
// several are refused by name, never guessed.

const nextExpenseDisplayId = vi.fn(async () => "EXP-2026-00042");
const generateExpenseNumber = vi.fn(async () => ({ number: "12225", seq: 1, loadNumber: "12225" }));
const insertExpenseLoadLink = vi.fn(async () => undefined);
const postSourceTransactionInClientTx = vi.fn(async () => ({ journal_entry_id: "je-1", posting_batch_id: "pb-1" }));
vi.mock("../display-id.js", () => ({ nextExpenseDisplayId }));
vi.mock("../../expense-attribution/expense-number.js", () => ({ generateExpenseNumber, insertExpenseLoadLink }));
vi.mock("../posting-engine.service.js", () => ({ postSourceTransactionInClientTx }));

const {
  resolveExpenseItemForAccount,
  createAndPostBankLineExpenseOnClient,
  adoptBankCategorizationExpenseDocument,
  BankLineExpenseError,
} = await import("../bank-line-expense.service.js");

const CO = "11111111-1111-4111-8111-111111111111";

function itemsClient(mapped: Array<{ id: string; item_name: string }>, explicitOk = true) {
  return {
    query: vi.fn(async (text: string) => {
      if (/WHERE id = \$1::uuid AND operating_company_id/.test(text)) return { rows: explicitOk ? [{ id: "item-x", default_expense_account_id: "a" }] : [] };
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
        if (/FROM catalogs\.accounts a WHERE a\.id/.test(text)) return { rows: [{ label: "6900 Miscellaneous" }] };
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
    const headerExpect: Record<string, unknown> = {
      operating_company_id: CO, status: "draft", posting_status: "unposted", transaction_date: "2026-08-18", total_amount_cents: 14614,
      memo: "ED-HER PLASTICS", expense_number: "EXP-2026-00042", vendor_uuid: "v-edher", payment_account_uuid: "acct-1000",
      is_sample_data: false, is_company_expense: true, is_reimbursable: false, source_bank_transaction_id: "bt-1",
      load_id: null, unit_id: null, trailer_id: null, driver_uuid: null, created_by_user_id: "u-1", updated_by_user_id: "u-1",
      non_owned_trailer_id: null,
    };
    for (const [k, v] of Object.entries(headerExpect)) expect(col(header, k), k).toEqual(v);
    const line = calls.find((c) => /INSERT INTO accounting\.expense_lines/.test(c.text))!;
    expect(["operating_company_id", "expense_id", "amount", "amount_cents", "description", "expense_account_uuid", "item_id"].map((k) => col(line, k))).toEqual([CO, "exp-1", 146.14, 14614, "ED-HER PLASTICS", "acct-6900", "item-misc"]);
    // 443.105 #2 — no load: the line says why (company cost on its account, from this bank line).
    expect(line.text).toMatch(/load_exemption_reason/);
    expect(col(line, "load_exemption_reason")).toBe("Company cost — 6900 Miscellaneous — not tied to a load (bank line 2026-08-18)");
    expect(postSourceTransactionInClientTx).toHaveBeenCalledWith(
      client,
      { operating_company_id: CO, source_transaction_type: "expense", source_transaction_id: "exp-1" },
      { userId: "u-1" }
    );
    expect(calls.some((c) => /SET status = 'posted', posting_status = 'posted'/.test(c.text))).toBe(true);
  });
});

describe("createAndPostBankLineExpenseOnClient — load or exemption reason (443.105 #2)", () => {
  const base = {
    operatingCompanyId: CO,
    transactionDate: "2026-01-15",
    amountCents: 500,
    memo: "External transfer fee",
    vendorId: "v-bofa",
    paymentAccountId: "acct-1000",
    expenseAccountId: "acct-6300",
    itemId: "item-wire",
    lineDescription: "External transfer fee",
    sourceBankTransactionId: "bt-9",
  };
  const run = async (extra: Record<string, unknown>) => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        if (/INSERT INTO accounting\.expenses/.test(text)) return { rows: [{ id: "exp-9" }] };
        if (/FROM mdata\.loads l/.test(text)) return { rows: [{ unit_id: null, primary_driver_id: null, secondary_driver_id: null, company_trailer_id: null, non_owned_trailer_id: null, trailer_source: "none" }] };
        if (/FROM catalogs\.accounts a WHERE a\.id/.test(text)) return { rows: [{ label: "6300 Bank Service Charges & Wire Fees" }] };
        return { rows: [] };
      }),
    };
    await createAndPostBankLineExpenseOnClient(client as never, { ...base, ...extra } as never, { userId: "u-1" });
    return calls.find((c) => /INSERT INTO accounting\.expense_lines/.test(c.text))!;
  };
  it("a line with a load carries no reason (the load is the link)", async () => {
    const line = await run({ loadId: "load-1" });
    expect(col(line, "load_id")).toBe("load-1");
    expect(col(line, "load_exemption_reason")).toBeNull();
  });
  // DEGH-06 / 443.113-C — load-tagged bank-line expense uses the load spine, never EXP-YYYY-#####
  it("DEGH-06: loadId uses generateExpenseNumber + insertExpenseLoadLink, not nextExpenseDisplayId", async () => {
    generateExpenseNumber.mockClear();
    insertExpenseLoadLink.mockClear();
    nextExpenseDisplayId.mockClear();
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        if (/INSERT INTO accounting\.expenses/.test(text)) return { rows: [{ id: "exp-load" }] };
        if (/FROM mdata\.loads l/.test(text)) return { rows: [{ unit_id: null, primary_driver_id: null, secondary_driver_id: null, company_trailer_id: null, non_owned_trailer_id: null, trailer_source: "none" }] };
        return { rows: [] };
      }),
    };
    await createAndPostBankLineExpenseOnClient(
      client as never,
      { ...base, loadId: "load-12225" } as never,
      { userId: "u-1" }
    );
    expect(generateExpenseNumber).toHaveBeenCalledWith(client, "load-12225", CO);
    expect(insertExpenseLoadLink).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ expenseId: "exp-load", loadId: "load-12225", expenseNumber: "12225" })
    );
    expect(nextExpenseDisplayId).not.toHaveBeenCalled();
    const header = calls.find((c) => /INSERT INTO accounting\.expenses/.test(c.text))!;
    expect(col(header, "expense_number")).toBe("12225");
  });
  it("the caller's reason wins over the derived one", async () => {
    const line = await run({ loadExemptionReason: "Owner: bank fee for the operating account" });
    expect(col(line, "load_exemption_reason")).toBe("Owner: bank fee for the operating account");
  });
  it("a reconciliation service charge (no bank line) names that context", async () => {
    const line = await run({ sourceBankTransactionId: null });
    expect(col(line, "load_exemption_reason")).toBe("Company cost — 6300 Bank Service Charges & Wire Fees — not tied to a load (reconciliation service charge 2026-01-15)");
  });
});

describe("adoptBankCategorizationExpenseDocument — G6 (one JE, document adopts it)", () => {
  it("inserts posted expense+line on the live JE, stamps matched_expense_id, never re-posts", async () => {
    postSourceTransactionInClientTx.mockClear();
    nextExpenseDisplayId.mockClear();
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[] ) => {
        calls.push({ text, values });
        if (/FROM banking\.bank_transactions bt/.test(text) && /matched_je/.test(text)) {
          return {
            rows: [{
              transaction_date: "2026-04-30",
              description: "NP WIRELESS",
              categorization_memo: null,
              vendor_id: "v-np",
              load_id: null,
              unit_id: null,
              trailer_id: null,
              driver_id: null,
              amount_cents: "-2705",
              matched_je: "je-legacy",
              matched_expense: null,
            }],
          };
        }
        if (/FROM accounting\.expenses/.test(text) && /journal_entry_id/.test(text)) return { rows: [] };
        if (/source_bank_transaction_id/.test(text) && /FROM accounting\.expenses/.test(text)) return { rows: [] };
        if (/FROM accounting\.journal_entry_postings p/.test(text)) {
          return {
            rows: [
              { account_id: "acct-6100", debit_or_credit: "debit", amount_cents: "2705", account_type: "Expense", account_number: "6100", account_name: "Telephone" },
              { account_id: "acct-bank", debit_or_credit: "credit", amount_cents: "2705", account_type: "Bank", account_number: "1000", account_name: "Checking" },
            ],
          };
        }
        if (/WHERE id = \$1::uuid AND operating_company_id/.test(text) && /catalogs\.items/.test(text)) {
          return { rows: [{ id: "item-phone", default_expense_account_id: "acct-6100" }] };
        }
        if (/INSERT INTO accounting\.expenses/.test(text)) return { rows: [{ id: "exp-adopt" }] };
        return { rows: [] };
      }),
    };
    const out = await adoptBankCategorizationExpenseDocument(
      client as never,
      { operatingCompanyId: CO, bankTransactionId: "bt-legacy", itemId: "item-phone" },
      { userId: "u-1" }
    );
    expect(out).toEqual({
      outcome: "created",
      expense_id: "exp-adopt",
      journal_entry_id: "je-legacy",
      expense_number: "EXP-2026-00042",
    });
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
    expect(nextExpenseDisplayId).toHaveBeenCalled();
    const header = calls.find((c) => /INSERT INTO accounting\.expenses/.test(c.text))!;
    expect(col(header, "journal_entry_id")).toBe("je-legacy"); // journal_entry_id adopted
    expect(col(header, "posted_at")).toBe("now()");
    expect(col(header, "expense_number")).toBe("EXP-2026-00042");
    expect(calls.some((c) => /SET matched_expense_id = \$1::uuid/.test(c.text))).toBe(true);
  });

  it("returns already_exists when the bank line already names an expense", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (/FROM banking\.bank_transactions bt/.test(text)) {
          return {
            rows: [{
              transaction_date: "2026-04-30", description: "x", categorization_memo: null, vendor_id: null,
              load_id: null, unit_id: null, trailer_id: null, driver_id: null, amount_cents: "-1",
              matched_je: "je-1", matched_expense: "exp-existing",
            }],
          };
        }
        return { rows: [] };
      }),
    };
    await expect(
      adoptBankCategorizationExpenseDocument(
        client as never,
        { operatingCompanyId: CO, bankTransactionId: "bt-1", itemId: "item-x" },
        { userId: "u-1" }
      )
    ).resolves.toEqual({ outcome: "already_exists", expense_id: "exp-existing", journal_entry_id: "je-1" });
  });
});
