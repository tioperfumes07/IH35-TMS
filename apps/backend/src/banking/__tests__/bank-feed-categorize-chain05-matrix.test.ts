import { beforeEach, describe, expect, it, vi } from "vitest";

// ROUND 441.19 — CHAIN-05 (docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md): Categorize = ONE new journal entry
// per the §3 matrix; it never creates a document (Match links an existing one). Money out → Dr the chosen account / Cr the
// bank (A expense, A′ asset, A″ liability, A‴ equity); money in → Dr the bank / Cr the chosen account (B, B′, B″). The A/R
// and A/P control accounts are refused (§10.3).

const postSourceTransactionInClientTx = vi.fn(async () => ({ journal_entry_id: "je-cat", posting_batch_id: "batch-cat", result: "posted" }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransactionInClientTx }));
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
    status: "categorized", review_state: "categorized", is_credit: false, amount_cents: "1000",
    categorization_gl_account_id: "acct-cat", categorization_driver_id: null, category: null,
    linked_bill_id: null, linked_bill_status: null, matched_bill_id: null, matched_journal_entry_id: null, matched_document_id: null,
    transfer_kind: null, destination_bank_account_id: null, matched_transfer_id: null,
    bank_ledger_account_id: "acct-1000", bank_account_class: "depository", bank_ledger_account_type: "Asset",
    bank_ledger_account_subtype: "Checking", bank_ledger_account_name: "Bank of America - Operating", bank_account_hidden_at: null,
    cat_account_id: "acct-cat", cat_account_opco: CO, cat_account_deactivated_at: null, cat_account_is_postable: true,
    ...over,
  };
}

function client(txn: Record<string, unknown>, opts: { control?: boolean } = {}) {
  const sql: Array<{ text: string; values?: unknown[] }> = [];
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    sql.push({ text, values });
    if (/bt\.status::text\s+AS status/.test(text)) return { rows: [txn] };
    if (/FROM accounting\.chart_of_accounts_roles/.test(text)) return { rows: opts.control ? [{ "?column?": 1 }] : [] };
    if (/COUNT\(DISTINCT je\.id\)/.test(text)) return { rows: [{ n: "0" }] };
    return { rows: [] };
  });
  return { c: { query } as never, sql };
}

const run = (c: never) => postBankCategorizationOnClient(c, { companyId: CO, actorUserUuid: ACTOR, bankTransactionId: BT });

beforeEach(() => vi.clearAllMocks());

describe("CHAIN-05 categorize = one journal entry, never a document", () => {
  it.each([
    ["A  money out → expense", false],
    ["A′ money out → asset", false],
    ["A″ money out → liability (2410)", false],
    ["A‴ money out → equity (owner draw)", false],
    ["B  money in → income", true],
    ["B′ money in → liability (2410 loan proceeds)", true],
    ["money in → equity (3000 owner contribution)", true],
  ])("%s posts bank_categorization on the caller's client and stamps the entry", async (_row, isCredit) => {
    const { c, sql } = client(txnRow({ is_credit: isCredit }));
    const out = await run(c);
    expect(postSourceTransactionInClientTx).toHaveBeenCalledWith(
      c,
      expect.objectContaining({ source_transaction_type: "bank_categorization", source_transaction_id: BT, operating_company_id: CO }),
      { userId: ACTOR }
    );
    expect(sql.some((x) => /INSERT INTO accounting\.(expenses|deposits|bills|checks)/.test(x.text))).toBe(false);
    expect(sql.some((x) => /SET matched_journal_entry_id = \$1::uuid/.test(x.text))).toBe(true);
    expect(sql.some((x) => /matched_expense_id|matched_deposit_id/.test(x.text) && /^\s*UPDATE/.test(x.text))).toBe(false);
    expect(out).toMatchObject({ posted: true, journal_entry_id: "je-cat", direction: isCredit ? "money_in" : "money_out" });
  });

  it("refuses the A/R or A/P control account (§10.3) and posts nothing", async () => {
    const { c } = client(txnRow({}), { control: true });
    const out = await run(c);
    expect(out).toMatchObject({ posted: false, reason: "account_is_ar_ap_control" });
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
  });

  it("a line matched to a bill never posts (the CHAIN-04 event; no double count)", async () => {
    const { c } = client(txnRow({ matched_bill_id: "bill-1" }));
    const out = await run(c);
    expect(out).toMatchObject({ posted: false, reason: "already_matched_to_bill" });
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
  });

  it("a line already matched to a document (Match) never posts a categorization", async () => {
    const { c } = client(txnRow({ matched_document_id: "exp-9" }));
    const out = await run(c);
    expect(out).toMatchObject({ posted: false, reason: "already_matched_to_document" });
    expect(postSourceTransactionInClientTx).not.toHaveBeenCalled();
  });
});
