import { describe, expect, it, vi } from "vitest";

// B3: driver_advance source type in the posting engine. Pure unit test — DB + resolvers mocked.

const { mockQuery, mockWithCurrentUser, mockResolveAccountForCategory, mockResolveRoleAccountOptional } = vi.hoisted(
  () => {
    const query = vi.fn();
    return {
      mockQuery: query,
      mockWithCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
        fn({ query })
      ),
      mockResolveAccountForCategory: vi.fn(),
      mockResolveRoleAccountOptional: vi.fn(),
    };
  }
);

// Partial-mock so other exports (luciaPool, etc.) stay real for the module graph — auth/lucia.ts
// constructs its adapter from luciaPool at import time, so a bare replacement mock breaks the whole
// import chain (same fix shape as posting-kill-switch-gated.test.ts).
vi.mock("../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withCurrentUser: mockWithCurrentUser };
});
vi.mock("../expense-category-map/resolver.service.js", () => ({ resolveAccountForCategory: mockResolveAccountForCategory }));
vi.mock("../coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: mockResolveRoleAccountOptional }));

const { postSourceTransaction } = await import("../posting-engine.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const ADV = "44444444-4444-4444-8444-444444444444";
const DEBIT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // QBO-149 Driver Cash Advance (B1 resolver)
const CREDIT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // operator-chosen source/bank
const DEFAULT_CASH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function installMock(
  opts: { status?: string; posting_date?: string | null; fromBankAccountId?: string | null; bankLedgerAccountId?: string | null } = {}
) {
  const status = opts.status ?? "disbursed";
  const posting_date = opts.posting_date === undefined ? "2026-05-25" : opts.posting_date;
  const fromBankAccountId = opts.fromBankAccountId ?? null;
  const bankLedgerAccountId = opts.bankLedgerAccountId ?? null;
  const lines: Array<{ account_id: string; dc: string; cents: number }> = [];
  const links: Array<{ type: string; id: string }> = [];
  let entryDate: string | null = null;
  let seq = 0;
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("set_config")) return { rows: [] };
    // ACCT-F5653 — verifyCreditAccountBelongsToCompany's existence check: only the fixture's own
    // CREDIT, scoped to OPCO, resolves — anything else is a real, expected refusal, exercised by the
    // dedicated test below.
    if (sql.includes("FROM catalogs.accounts")) {
      if (String(params[0]) === CREDIT && String(params[1]) === OPCO) {
        return { rows: [{ id: CREDIT }] };
      }
      return { rows: [] };
    }
    if (sql.includes("driver_finance.driver_advances")) {
      return {
        rows: [
          {
            id: ADV,
            amount: "500.00",
            disbursement_status: status,
            posting_date,
            disbursed_at: "2026-06-13T00:00:00Z",
            created_at: "2026-06-13T00:00:00Z",
            from_bank_account_id: fromBankAccountId,
          },
        ],
      };
    }
    // ACCT-F358 — resolveBankLedgerAccountId's bank->GL bridge lookup on banking.bank_accounts.
    if (sql.includes("banking.bank_accounts")) {
      return { rows: [{ ledger_account_id: bankLedgerAccountId }] };
    }
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
    if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-1" }] };
    if (sql.includes("INSERT INTO accounting.journal_entries")) {
      entryDate = String(params[1]);
      return { rows: [{ id: "je-1" }] };
    }
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
      seq += 1;
      lines.push({ account_id: String(params[3]), dc: String(params[4]), cents: Number(params[5]) });
      return { rows: [{ id: `jep-${seq}` }] };
    }
    if (sql.includes("INSERT INTO accounting.transaction_source_links")) {
      links.push({ type: String(params[2]), id: String(params[3]) });
      return { rows: [] };
    }
    if (sql.includes("batch_status")) return { rows: [] };
    if (sql.includes("isBankAccountHideEnabled") || sql.includes("feature_flags")) return { rows: [] };
    return { rows: [] };
  });
  return { lines, links, getEntryDate: () => entryDate };
}

describe("posting-engine driver_advance source type (B3)", () => {
  it("posts balanced Dr QBO-149 / Cr chosen account with the user-settable (back-dated) posting_date", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    const cap = installMock({ posting_date: "2026-05-25" });

    const result = await postSourceTransaction(
      {
        operating_company_id: OPCO,
        source_transaction_type: "driver_advance",
        source_transaction_id: ADV,
        credit_account_id: CREDIT,
      },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    expect(result.source_transaction_type).toBe("driver_advance");
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(OPCO, "cash_advance", "cash_advance");

    // posting_date drives the journal entry date — cash given May 25 posts as 2026-05-25.
    expect(cap.getEntryDate()).toBe("2026-05-25");

    expect(cap.lines).toHaveLength(2);
    const debit = cap.lines.find((l) => l.dc === "debit");
    const credit = cap.lines.find((l) => l.dc === "credit");
    expect(debit?.account_id).toBe(DEBIT);
    expect(credit?.account_id).toBe(CREDIT);
    // $500.00 (numeric dollars) -> 50000 cents; balanced.
    expect(debit?.cents).toBe(50000);
    expect(credit?.cents).toBe(50000);
    expect(debit?.cents).toBe(credit?.cents);

    expect(cap.links.length).toBeGreaterThan(0);
    for (const link of cap.links) {
      expect(link.type).toBe("driver_advance");
      expect(link.id).toBe(ADV);
    }
    expect(mockResolveRoleAccountOptional).not.toHaveBeenCalled();
  });

  it("falls back to the company-default cash account when credit_account_id is omitted", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(DEFAULT_CASH);
    const cap = installMock();

    const result = await postSourceTransaction(
      { operating_company_id: OPCO, source_transaction_type: "driver_advance", source_transaction_id: ADV },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    expect(cap.lines.find((l) => l.dc === "credit")?.account_id).toBe(DEFAULT_CASH);
    expect(mockResolveRoleAccountOptional).toHaveBeenCalled();
  });

  it("refuses to post when the advance is not disbursed", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    installMock({ status: "approved" });

    await expect(
      postSourceTransaction(
        {
          operating_company_id: OPCO,
          source_transaction_type: "driver_advance",
          source_transaction_id: ADV,
          credit_account_id: CREDIT,
        },
        { userId: ACTOR }
      )
    ).rejects.toMatchObject({ code: "ADVANCE_NOT_POSTING_ELIGIBLE" });
  });

  // CLS-CASH-OUT-CREDITS-CLEARING-ACCOUNT / LV-ADVANCE-CREDITS-UNDEPOSITED-NOT-THE-BANK / ACCT-F358.
  it("ACCT-F358: credits the advance's OWN bank via the bank->GL bridge when from_bank_account_id is set and no override is supplied", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    const BANK_ACCOUNT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const BANK_LEDGER_ACCOUNT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const cap = installMock({ fromBankAccountId: BANK_ACCOUNT_ID, bankLedgerAccountId: BANK_LEDGER_ACCOUNT_ID });

    const result = await postSourceTransaction(
      { operating_company_id: OPCO, source_transaction_type: "driver_advance", source_transaction_id: ADV },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    // credited the advance's OWN bank's ledger account — NOT the company-default cash-like/clearing
    // account — and never touched resolveRoleAccountOptional (the old undeposited_funds fallback path).
    expect(cap.lines.find((l) => l.dc === "credit")?.account_id).toBe(BANK_LEDGER_ACCOUNT_ID);
    expect(mockResolveRoleAccountOptional).not.toHaveBeenCalled();
  });

  it("ACCT-F358: fails LOUD (never falls back to a clearing account) when the named bank has no ledger_account_id bridge", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    const BANK_ACCOUNT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    installMock({ fromBankAccountId: BANK_ACCOUNT_ID, bankLedgerAccountId: null });

    await expect(
      postSourceTransaction(
        { operating_company_id: OPCO, source_transaction_type: "driver_advance", source_transaction_id: ADV },
        { userId: ACTOR }
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_MAPPING_MISSING" });
    expect(mockResolveRoleAccountOptional).not.toHaveBeenCalled();
  });

  it("ACCT-F358: an explicit credit_account_id still overrides the advance's own named bank", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    const BANK_ACCOUNT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const cap = installMock({ fromBankAccountId: BANK_ACCOUNT_ID, bankLedgerAccountId: "should-not-be-used" });

    const result = await postSourceTransaction(
      {
        operating_company_id: OPCO,
        source_transaction_type: "driver_advance",
        source_transaction_id: ADV,
        credit_account_id: CREDIT,
      },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    expect(cap.lines.find((l) => l.dc === "credit")?.account_id).toBe(CREDIT);
  });

  it("ACCT-F5653: refuses to post when credit_account_id does not resolve for this operating_company_id", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    installMock();
    const FOREIGN_ACCOUNT = "99999999-9999-4999-8999-999999999999"; // belongs to no entity in this mock

    await expect(
      postSourceTransaction(
        {
          operating_company_id: OPCO,
          source_transaction_type: "driver_advance",
          source_transaction_id: ADV,
          credit_account_id: FOREIGN_ACCOUNT,
        },
        { userId: ACTOR }
      )
    ).rejects.toMatchObject({ code: "CREDIT_ACCOUNT_CROSS_ENTITY" });
  });
});
