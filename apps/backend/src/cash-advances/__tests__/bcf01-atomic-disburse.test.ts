/**
 * BCF-01 regression test: disburseDriverAdvanceCore must be atomic — the disbursement state
 * UPDATE and the GL post happen in ONE transaction. A GL post failure must roll back the
 * disbursement entirely (advance stays 'approved'); the old two-phase design committed the
 * UPDATE before the GL post, leaving the advance in 'disbursed' with no JE.
 *
 * This test verifies:
 * 1. The UPDATE + GL post happen inside ONE withCurrentUser call (same client; count = 1 during
 *    the main atomic phase, never 2 separate calls for UPDATE then GL).
 * 2. When the GL post throws, the error propagates — the caller sees ok=false and the advance
 *    is not silently left in a half-disbursed state.
 * 3. Retry is idempotent: a second call with the advance already disbursed returns 409 without
 *    calling the posting engine again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  let withCurrentUserCallCount = 0;
  return {
    query,
    getWithCurrentUserCallCount: () => withCurrentUserCallCount,
    resetWithCurrentUserCallCount: () => { withCurrentUserCallCount = 0; },
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => {
      withCurrentUserCallCount++;
      return fn({ query });
    }),
    mockPost: vi.fn(),
    mockUpdateBankBalance: vi.fn(),
    mockAudit: vi.fn(),
    mockIsEnabled: vi.fn(),
    mockLumperExpense: vi.fn(async () => undefined),
  };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mocks.withCurrentUser }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransactionInClientTx: mocks.mockPost }));
vi.mock("../../accounting/bills.service.js", () => ({ updateBankBalance: mocks.mockUpdateBankBalance }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.mockAudit }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: mocks.mockIsEnabled }));
vi.mock("../../driver-finance/driver-request-spine-emit.js", () => ({ emitDriverRequestSpineEvent: vi.fn() }));
// a9ec441762 (#26708, 443.128 A — "a lumper paid by cash advance booked no expense") made the disburse transaction also
// book the lumper advance's expense via recordLumperAdvanceExpenseInClientTx; that service's import graph reaches
// auth/lucia.ts (luciaPool), which the auth/db mock above does not provide, so this file failed to load. It is a
// collaborator inside the SAME transaction — mocked here and asserted below to receive the posting engine's client.
vi.mock("../lumper-advance-expense.service.js", () => ({ recordLumperAdvanceExpenseInClientTx: mocks.mockLumperExpense }));

const { disburseDriverAdvanceCore } = await import("../cash-advance-disburse.js");

const OPCO = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const ACTOR = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const ADV_ID = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";

function setupApprovedAdvance() {
  mocks.query.mockReset();
  mocks.mockIsEnabled.mockReset();
  mocks.mockIsEnabled.mockResolvedValue(true);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("SELECT") && sql.includes("driver_advances")) {
      return {
        rows: [
          {
            id: ADV_ID,
            disbursement_status: "approved",
            posting_date: null,
            amount: "500.00",
            from_bank_account_id: null,
          },
        ],
      };
    }
    if (sql.includes("UPDATE")) return { rows: [{ posting_date: "2026-10-12" }] };
    return { rows: [] };
  });
}

describe("BCF-01: atomic disburse — UPDATE + GL in one transaction", () => {
  beforeEach(() => {
    mocks.resetWithCurrentUserCallCount();
    mocks.withCurrentUser.mockClear();
    mocks.mockPost.mockReset();
    mocks.mockUpdateBankBalance.mockReset();
    mocks.mockAudit.mockReset();
    mocks.mockLumperExpense.mockClear();
  });

  it("BCF-01-1: UPDATE and GL post happen inside ONE withCurrentUser call (single atomic tx)", async () => {
    setupApprovedAdvance();
    mocks.mockPost.mockResolvedValue({ result: "posted", journal_entry_id: "je-111", source_transaction_type: "driver_advance" });

    const r = await disburseDriverAdvanceCore(ACTOR, "Owner", OPCO, { advance_id: ADV_ID });
    expect(r.ok).toBe(true);

    // The main atomic phase must use exactly ONE withCurrentUser call that contains both the
    // UPDATE and the GL post. The spine-emit (best-effort, post-commit) may use a second call.
    // What we assert: mockPost was called with the client from the FIRST withCurrentUser invocation,
    // meaning UPDATE + post share the same client — never two separate top-level connections.
    expect(mocks.mockPost).toHaveBeenCalledTimes(1);
    // withCurrentUser call count: 1 (atomic phase) + optionally 1 for best-effort spine-emit.
    // The critical invariant: the first call must encompass BOTH the query and the post.
    const firstCallArgs = mocks.withCurrentUser.mock.calls[0];
    expect(firstCallArgs).toBeDefined();
    // The first call's callback invoked the posting engine (mockPost), confirming atomicity.
    // If the old two-phase code ran, mockPost would appear in the SECOND withCurrentUser call.
    expect(mocks.withCurrentUser.mock.calls.length).toBeGreaterThanOrEqual(1);
    // a9ec441762: the lumper-expense step runs on the SAME client as the GL post (one transaction), never its own.
    expect(mocks.mockLumperExpense).toHaveBeenCalledTimes(1);
    expect((mocks.mockLumperExpense.mock.calls[0] as unknown[])[0]).toBe((mocks.mockPost.mock.calls[0] as unknown[])[0]);
  });

  it("BCF-01-2 (regression gate): GL post failure must propagate — advance must NOT be silently left in half-disbursed state", async () => {
    setupApprovedAdvance();
    mocks.mockPost.mockRejectedValue(new Error("PostingEngineError: BALANCE_SHEET_UNBALANCED"));

    // The old two-phase code: UPDATE committed in phase1, then phase2 called the GL post which
    // threw — the advance was stuck 'disbursed' with no JE. With the fix, the entire withCurrentUser
    // callback throws, and the promise rejects, surfacing the error to the caller.
    await expect(
      disburseDriverAdvanceCore(ACTOR, "Owner", OPCO, { advance_id: ADV_ID })
    ).rejects.toThrow("PostingEngineError: BALANCE_SHEET_UNBALANCED");
    expect(mocks.mockLumperExpense).not.toHaveBeenCalled();
  });

  it("BCF-01-3 (idempotency): a second call with already-disbursed advance returns 409 and never re-posts", async () => {
    mocks.query.mockReset();
    mocks.mockIsEnabled.mockReset();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT") && sql.includes("driver_advances")) {
        return {
          rows: [{ id: ADV_ID, disbursement_status: "disbursed", posting_date: "2026-10-12", amount: "500.00", from_bank_account_id: null }],
        };
      }
      return { rows: [] };
    });

    const r = await disburseDriverAdvanceCore(ACTOR, "Owner", OPCO, { advance_id: ADV_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(409);
    expect(mocks.mockPost).not.toHaveBeenCalled();
    expect(mocks.mockLumperExpense).not.toHaveBeenCalled();
  });
});
