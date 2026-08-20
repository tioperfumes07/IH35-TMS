import { beforeEach, describe, expect, it, vi } from "vitest";

// ACCT-F5616 — createCorrectiveJournalEntry's pickCorrectionAccounts() previously picked whichever
// TWO accounts sorted first by created_at, with no role/purpose resolution at all. This suite proves
// the replacement: it resolves driver_pay_expense (debit) and settlement_dispute_correction_recovery
// (credit) via the standard fail-closed CoA-role chain, and fails closed (E_CORRECTIVE_JE_ACCOUNTS_MISSING)
// when either role is undesignated -- never silently falling back to an arbitrary account pick.
//
// ACCT-F5643 — createCorrectiveJournalEntry used to open its OWN withCurrentUser connection (a
// SECOND, independent DB connection) and call createJournalEntry() on it, even though every call site
// already holds an open transaction with the dispute row locked FOR UPDATE. A failure anywhere after
// the inner commit left a permanently-posted corrective JE with the dispute rolled back to still-open
// -- a retry would post a SECOND corrective JE for the same dispute. Fixed by taking the CALLER'S
// client directly and posting via createJournalEntryOnClient, atomic with the caller's own
// transaction -- mirroring escrow-forfeit.service.ts's established pattern. This suite now mocks
// createJournalEntryOnClient (not createJournalEntry) and passes a plain fake client instead of
// exercising withCurrentUser, proving the function no longer opens a second connection at all.

const mocked = vi.hoisted(() => ({
  isEnabledMock: vi.fn(),
  resolveRoleAccountOptionalMock: vi.fn(),
  createJournalEntryOnClientMock: vi.fn(),
}));

vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: mocked.isEnabledMock,
}));

vi.mock("../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: mocked.resolveRoleAccountOptionalMock,
}));

vi.mock("../accounting/journal-entries.service.js", () => ({
  createJournalEntryOnClient: mocked.createJournalEntryOnClientMock,
}));

import { createCorrectiveJournalEntry } from "./settlement-dispute.service.js";

const OCID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const DISPUTE_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088";
const SETTLEMENT_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072";
const DRIVER_PAY_EXPENSE_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f9001";
const CORRECTION_RECOVERY_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f9002";

/** ACCT-F5643 — a single fake client, no withCurrentUser involved. */
function fakeClient() {
  return { query: vi.fn(async () => ({ rows: [] })) };
}

describe("createCorrectiveJournalEntry (ACCT-F5616 + ACCT-F5643)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves Dr driver_pay_expense / Cr settlement_dispute_correction_recovery via role, not an arbitrary account pick", async () => {
    const client = fakeClient();
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.resolveRoleAccountOptionalMock.mockImplementation(async (_client: unknown, _ocid: string, role: string) => {
      if (role === "driver_pay_expense") return DRIVER_PAY_EXPENSE_ID;
      if (role === "settlement_dispute_correction_recovery") return CORRECTION_RECOVERY_ID;
      return null;
    });
    mocked.createJournalEntryOnClientMock.mockResolvedValue({ id: "je-1" });

    const jeId = await createCorrectiveJournalEntry(client, {
      actorUserId: "user-1",
      actorRole: "Owner",
      operatingCompanyId: OCID,
      disputeId: DISPUTE_ID,
      settlementId: SETTLEMENT_ID,
      amountCents: 40000,
      resolutionNotes: "Approved: wrong deduction reversed per driver evidence",
    });

    expect(jeId).toBe("je-1");
    expect(mocked.resolveRoleAccountOptionalMock).toHaveBeenCalledWith(expect.anything(), OCID, "driver_pay_expense");
    expect(mocked.resolveRoleAccountOptionalMock).toHaveBeenCalledWith(
      expect.anything(),
      OCID,
      "settlement_dispute_correction_recovery"
    );
    // ACCT-F5643 — the caller's own client is threaded straight into createJournalEntryOnClient's
    // FIRST argument, no second connection ever opened.
    expect(mocked.createJournalEntryOnClientMock.mock.calls[0][0]).toBe(client);
    const postings = mocked.createJournalEntryOnClientMock.mock.calls[0][1].postings;
    expect(postings).toEqual([
      expect.objectContaining({ account_id: DRIVER_PAY_EXPENSE_ID, debit_or_credit: "debit", amount_cents: 40000 }),
      expect.objectContaining({ account_id: CORRECTION_RECOVERY_ID, debit_or_credit: "credit", amount_cents: 40000 }),
    ]);
  });

  it("fails closed (throws) when settlement_dispute_correction_recovery is undesignated -- never falls back to an arbitrary account", async () => {
    const client = fakeClient();
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.resolveRoleAccountOptionalMock.mockImplementation(async (_client: unknown, _ocid: string, role: string) =>
      role === "driver_pay_expense" ? DRIVER_PAY_EXPENSE_ID : null
    );

    await expect(
      createCorrectiveJournalEntry(client, {
        actorUserId: "user-1",
        actorRole: "Owner",
        operatingCompanyId: OCID,
        disputeId: DISPUTE_ID,
        settlementId: SETTLEMENT_ID,
        amountCents: 40000,
        resolutionNotes: "Approved: wrong deduction reversed per driver evidence",
      })
    ).rejects.toThrow("E_CORRECTIVE_JE_ACCOUNTS_MISSING");
    expect(mocked.createJournalEntryOnClientMock).not.toHaveBeenCalled();
  });

  it("posts nothing and returns null when SETTLEMENT_GL_POSTING flag is OFF (checked before any account resolution)", async () => {
    const client = fakeClient();
    mocked.isEnabledMock.mockResolvedValue(false);

    const jeId = await createCorrectiveJournalEntry(client, {
      actorUserId: "user-1",
      actorRole: "Owner",
      operatingCompanyId: OCID,
      disputeId: DISPUTE_ID,
      settlementId: SETTLEMENT_ID,
      amountCents: 40000,
      resolutionNotes: "Approved: wrong deduction reversed per driver evidence",
    });

    expect(jeId).toBeNull();
    expect(mocked.resolveRoleAccountOptionalMock).not.toHaveBeenCalled();
    expect(mocked.createJournalEntryOnClientMock).not.toHaveBeenCalled();
  });
});
