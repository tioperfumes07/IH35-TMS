import { describe, expect, it, vi } from "vitest";

// B2: cash_advance source type in the posting engine.
// Pure unit test — DB + resolvers are mocked (same pattern as fuel-posting poster tests).

const {
  mockQuery,
  mockWithCurrentUser,
  mockResolveAccountForCategory,
  mockResolveRoleAccountOptional,
} = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
      fn({ query })
    ),
    mockResolveAccountForCategory: vi.fn(),
    mockResolveRoleAccountOptional: vi.fn(),
  };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

vi.mock("../coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: mockResolveRoleAccountOptional,
}));

const { postSourceTransaction, PostingEngineError } = await import("../posting-engine.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const DEBIT_ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // QBO-149 Driver Cash Advance (from B1 resolver)
const CHOSEN_CREDIT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // operator-chosen source/bank (B5)
const DEFAULT_CASH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // company-default cash-like fallback

type CapturedLine = { account_id: string; debit_or_credit: string; amount_cents: number };

function installQueryMock(opts: { status?: string } = {}) {
  const status = opts.status ?? "approved";
  const postingLines: CapturedLine[] = [];
  const sourceLinks: Array<{ linked_object_type: string; linked_object_id: string }> = [];
  let lineSeq = 0;

  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("driver_finance.cash_advance_requests")) {
      return { rows: [{ id: SOURCE_ID, requested_amount_cents: "50000", status, posting_date: "2026-06-13" }] };
    }
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
    if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-1" }] };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-1" }] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
      lineSeq += 1;
      postingLines.push({
        account_id: String(params[3]),
        debit_or_credit: String(params[4]),
        amount_cents: Number(params[5]),
      });
      return { rows: [{ id: `jep-${lineSeq}` }] };
    }
    if (sql.includes("INSERT INTO accounting.transaction_source_links")) {
      sourceLinks.push({ linked_object_type: String(params[2]), linked_object_id: String(params[3]) });
      return { rows: [] };
    }
    // idempotency existing-batch lookup ("SELECT id::text, batch_status ...") → none
    if (sql.includes("batch_status")) return { rows: [] };
    return { rows: [] };
  });

  return { postingLines, sourceLinks };
}

describe("posting-engine cash_advance source type (B2)", () => {
  it("posts balanced Dr cash_advance account / Cr chosen credit account, linked to source_id", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT_ACCOUNT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    const { postingLines, sourceLinks } = installQueryMock();

    const result = await postSourceTransaction(
      {
        operating_company_id: OPCO,
        source_transaction_type: "cash_advance",
        source_transaction_id: SOURCE_ID,
        credit_account_id: CHOSEN_CREDIT,
      },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    expect(result.source_transaction_type).toBe("cash_advance");

    // DEBIT resolves to the B1 cash_advance account via the category resolver.
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(OPCO, "cash_advance", "cash_advance");

    expect(postingLines).toHaveLength(2);
    const debit = postingLines.find((l) => l.debit_or_credit === "debit");
    const credit = postingLines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(DEBIT_ACCOUNT);
    expect(credit?.account_id).toBe(CHOSEN_CREDIT); // uses the passed account
    // Balanced: debit total === credit total, both > 0.
    const debitTotal = postingLines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const creditTotal = postingLines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
    expect(debitTotal).toBe(50000);
    expect(creditTotal).toBe(50000);
    expect(debitTotal).toBe(creditTotal);

    // Audit spine: every line linked to the cash_advance source_id.
    expect(sourceLinks.length).toBeGreaterThan(0);
    for (const link of sourceLinks) {
      expect(link.linked_object_type).toBe("cash_advance");
      expect(link.linked_object_id).toBe(SOURCE_ID);
    }
    // Default cash resolver NOT used when an explicit credit account is provided.
    expect(mockResolveRoleAccountOptional).not.toHaveBeenCalled();
  });

  it("falls back to the company-default cash account when credit_account_id is omitted", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT_ACCOUNT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(DEFAULT_CASH); // undeposited_funds role
    const { postingLines } = installQueryMock();

    const result = await postSourceTransaction(
      {
        operating_company_id: OPCO,
        source_transaction_type: "cash_advance",
        source_transaction_id: SOURCE_ID,
        // credit_account_id omitted → default
      },
      { userId: ACTOR }
    );

    expect(result.result).toBe("posted");
    const credit = postingLines.find((l) => l.debit_or_credit === "credit");
    expect(credit?.account_id).toBe(DEFAULT_CASH);
    expect(mockResolveRoleAccountOptional).toHaveBeenCalled();
  });

  it("refuses to post when the request is not approved", async () => {
    mockWithCurrentUser.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: DEBIT_ACCOUNT, posting_side: "debit" });
    mockResolveRoleAccountOptional.mockReset();
    installQueryMock({ status: "pending" });

    await expect(
      postSourceTransaction(
        {
          operating_company_id: OPCO,
          source_transaction_type: "cash_advance",
          source_transaction_id: SOURCE_ID,
          credit_account_id: CHOSEN_CREDIT,
        },
        { userId: ACTOR }
      )
    ).rejects.toMatchObject({ code: "ADVANCE_NOT_POSTING_ELIGIBLE" });
    expect(PostingEngineError).toBeDefined();
  });
});
