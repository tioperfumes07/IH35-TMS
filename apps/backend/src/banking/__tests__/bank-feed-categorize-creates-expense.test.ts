import { beforeEach, describe, expect, it, vi } from "vitest";

// ROUND 441.5 Phase 1 (owner 2026-10-07: "ours should work exactly as quickbooks") — a money-OUT bank line categorized
// to an expense / cost account CREATES an Expense document (payee, paid-from bank account, the chosen account, its item)
// through the expense poster, linked both ways. Money in, liabilities, equity and assets keep the categorization entry.

const postSourceTransactionInClientTx = vi.fn(async () => ({
  journal_entry_id: "je-cat",
  posting_batch_id: "batch-cat",
  result: "posted",
}));
const createAndPostBankLineExpenseOnClient = vi.fn(async () => ({
  expense_id: "exp-1",
  journal_entry_id: "je-exp",
  posting_batch_id: "batch-exp",
}));
const resolveExpenseItemForAccount = vi.fn(async () => "item-1");
const createAndPostBankLineDepositOnClient = vi.fn(async () => ({
  deposit_id: "dep-1",
  display_id: "DEP-2026-00001",
  journal_entry_id: "je-dep",
  posting_batch_id: "batch-dep",
}));

vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransactionInClientTx }));
vi.mock("../../accounting/bank-line-expense.service.js", () => ({
  createAndPostBankLineExpenseOnClient,
  resolveExpenseItemForAccount,
}));
vi.mock("../../accounting/bank-deposits.service.js", () => ({ createAndPostBankLineDepositOnClient }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => true) }));
vi.mock("../../accounting/expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: vi.fn(async () => ({ account_id: "advance-acct" })),
  ExpenseCategoryMapResolutionError: class extends Error {},
}));
vi.mock("../bank-account-visibility.js", () => ({ isBankAccountHideEnabled: vi.fn(async () => false) }));
vi.mock("../../accounting/shared.js", () => ({ withCompanyScope: vi.fn() }));

const { postBankCategorizationOnClient } = await import("../bank-feed-gl-posting.service.js");

const CO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BT = "33333333-3333-4333-8333-333333333333";

function txnRow(over: Record<string, unknown>) {
  return {
    status: "categorized",
    review_state: "categorized",
    is_credit: false,
    amount_cents: "1000",
    categorization_gl_account_id: "acct-6310",
    categorization_driver_id: null,
    category: null,
    linked_bill_id: null,
    linked_bill_status: null,
    matched_bill_id: null,
    matched_journal_entry_id: null,
    matched_document_id: null,
    transfer_kind: null,
    destination_bank_account_id: null,
    matched_transfer_id: null,
    bank_ledger_account_id: "acct-1000",
    bank_account_class: "depository",
    bank_ledger_account_type: "Asset",
    bank_ledger_account_subtype: "Checking",
    bank_ledger_account_name: "Bank of America - Operating",
    bank_account_hidden_at: null,
    cat_account_id: "acct-6310",
    cat_account_opco: CO,
    cat_account_deactivated_at: null,
    cat_account_is_postable: true,
    cat_account_type: "Expense",
    ...over,
  };
}

function client(txn: Record<string, unknown>, opts: { vendorActive?: boolean } = {}) {
  const sql: Array<{ text: string; values?: unknown[] }> = [];
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    sql.push({ text, values });
    if (/bt\.status::text\s+AS status/.test(text)) return { rows: [txn] };
    if (/bt\.bank_account_id::text AS bank_account_id/.test(text)) {
      return { rows: [{ transaction_date: "2026-09-21", description: "TRANSFER FROM JORGE", categorization_memo: null, bank_account_id: "ba-bofa", vendor_id: "vendor-x", customer_id: null }] };
    }
    if (/bt\.transaction_date::text AS transaction_date/.test(text)) {
      return {
        rows: [
          {
            transaction_date: "2026-01-20",
            description: "OVERDRAFT ITEM FEE",
            categorization_memo: null,
            vendor_id: "vendor-bofa",
            item_id: null,
            load_id: null,
            unit_id: "unit-7",
            trailer_id: null,
            driver_id: null,
            account_number: "6310",
            account_name: "Overdraft / NSF Fees",
          },
        ],
      };
    }
    if (/FROM mdata\.(vendors|customers)/.test(text)) return { rows: opts.vendorActive === false ? [] : [{ "?column?": 1 }] };
    if (/COUNT\(DISTINCT je\.id\)/.test(text)) return { rows: [{ n: "0" }] };
    return { rows: [] };
  });
  return { c: { query } as never, sql };
}

const run = (c: never) => postBankCategorizationOnClient(c, { companyId: CO, actorUserUuid: ACTOR, bankTransactionId: BT });

beforeEach(() => vi.clearAllMocks());

describe("categorize poster — money out to an expense account creates an Expense (ROUND 441.5)", () => {
  it("creates the expense with the payee, the paid-from bank account, the chosen account and its item, and links the line", async () => {
    const { c, sql } = client(txnRow({}));
    const out = await run(c);
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled(); // no bare bank_categorization JE
    expect(resolveExpenseItemForAccount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ operatingCompanyId: CO, accountId: "acct-6310", explicitItemId: null }));
    expect(createAndPostBankLineExpenseOnClient).toHaveBeenCalledTimes(1);
    const [, input, actor] = createAndPostBankLineExpenseOnClient.mock.calls[0] as unknown as [unknown, Record<string, unknown>, { userId: string }];
    expect(input).toMatchObject({
      operatingCompanyId: CO,
      transactionDate: "2026-01-20",
      amountCents: 1000,
      vendorId: "vendor-bofa",
      paymentAccountId: "acct-1000",
      expenseAccountId: "acct-6310",
      itemId: "item-1",
      sourceBankTransactionId: BT,
      unitId: "unit-7",
    });
    expect(actor).toEqual({ userId: ACTOR });
    const stamp = sql.find((s) => /SET matched_expense_id = \$1::uuid/.test(s.text));
    expect(stamp?.values).toEqual(["exp-1", "je-exp", BT, CO]);
    expect(stamp?.text).toMatch(/resolution_kind = 'added'/);
    expect(out).toMatchObject({ posted: true, expense_id: "exp-1", journal_entry_id: "je-exp", direction: "money_out" });
  });

  it.each(["CostOfGoodsSold", "OtherExpense"])("does the same for a %s account", async (type) => {
    const { c } = client(txnRow({ cat_account_type: type }));
    await run(c);
    expect(createAndPostBankLineExpenseOnClient).toHaveBeenCalledTimes(1);
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
  });

  it("refuses a vendor tag from another company instead of carrying it onto the document", async () => {
    const { c } = client(txnRow({}), { vendorActive: false });
    const out = await run(c);
    expect(out).toMatchObject({ posted: false, reason: "account_cross_entity" });
    expect(createAndPostBankLineExpenseOnClient).not.toHaveBeenCalled();
  });

  it("an item that cannot be resolved rolls the categorization back (throws), never posts without one", async () => {
    resolveExpenseItemForAccount.mockRejectedValueOnce(new Error("category_account_has_no_item"));
    const { c } = client(txnRow({}));
    await expect(run(c)).rejects.toThrow("category_account_has_no_item");
    expect(createAndPostBankLineExpenseOnClient).not.toHaveBeenCalled();
  });
});

describe("categorize poster — money IN creates a Deposit (ROUND 441.5 Phase 2)", () => {
  it.each([
    ["a liability (2410 related-party loan)", "Liability"],
    ["equity (3000 owner's capital)", "Equity"],
    ["income", "Income"],
    ["an expense account (a refund)", "Expense"],
  ])("money in to %s is a Deposit crediting that account, linked both ways", async (_label, type) => {
    const { c, sql } = client(txnRow({ is_credit: true, cat_account_type: type, categorization_gl_account_id: "acct-2410", cat_account_id: "acct-2410" }));
    const out = await run(c);
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
    expect(createAndPostBankLineExpenseOnClient).not.toHaveBeenCalled();
    const [, input, actor] = createAndPostBankLineDepositOnClient.mock.calls[0] as unknown as [unknown, Record<string, unknown>, { userId: string }];
    expect(input).toMatchObject({
      operatingCompanyId: CO,
      depositDate: "2026-09-21",
      amountCents: 1000,
      bankAccountId: "ba-bofa",
      bankLedgerAccountId: "acct-1000",
      accountId: "acct-2410",
      receivedFromVendorId: "vendor-x",
      receivedFromCustomerId: null,
      sourceBankTransactionId: BT,
    });
    expect(actor).toEqual({ userId: ACTOR });
    const stamp = sql.find((x) => /SET matched_deposit_id = \$1::uuid/.test(x.text));
    expect(stamp?.values).toEqual(["dep-1", "je-dep", BT, CO]);
    expect(out).toMatchObject({ posted: true, deposit_id: "dep-1", journal_entry_id: "je-dep", direction: "money_in" });
    createAndPostBankLineDepositOnClient.mockClear();
  });

  it("refuses a payer tag from another company", async () => {
    const { c } = client(txnRow({ is_credit: true, cat_account_type: "Liability" }), { vendorActive: false });
    const out = await run(c);
    expect(out).toMatchObject({ posted: false, reason: "account_cross_entity" });
    expect(createAndPostBankLineDepositOnClient).not.toHaveBeenCalled();
  });
});

describe("categorize poster — EVERY money-out is an Expense, whatever the account (ROUND 441.16)", () => {
  it.each([
    ["a liability (2410)", "Liability"],
    ["equity", "Equity"],
    ["an asset", "Asset"],
  ])("money out to %s creates the Expense, never a bare entry", async (_label, type) => {
    const { c } = client(txnRow({ cat_account_type: type }));
    const out = await run(c);
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
    expect(createAndPostBankLineExpenseOnClient).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ posted: true, expense_id: "exp-1", direction: "money_out" });
  });
});
