import { beforeEach, describe, expect, it, vi } from "vitest";

// ACCT-F5616 — createCorrectiveJournalEntry's pickCorrectionAccounts() previously picked whichever
// TWO accounts sorted first by created_at, with no role/purpose resolution at all. This suite proves
// the replacement: it resolves driver_pay_expense (debit) and settlement_dispute_correction_recovery
// (credit) via the standard fail-closed CoA-role chain, and fails closed (E_CORRECTIVE_JE_ACCOUNTS_MISSING)
// when either role is undesignated -- never silently falling back to an arbitrary account pick.

const mocked = vi.hoisted(() => ({
  withCurrentUserMock: vi.fn(),
  isEnabledMock: vi.fn(),
  resolveRoleAccountOptionalMock: vi.fn(),
  createJournalEntryMock: vi.fn(),
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUserMock,
}));

vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: mocked.isEnabledMock,
}));

vi.mock("../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: mocked.resolveRoleAccountOptionalMock,
}));

vi.mock("../accounting/journal-entries.service.js", () => ({
  createJournalEntry: mocked.createJournalEntryMock,
}));

import { createCorrectiveJournalEntry } from "./settlement-dispute.service.js";

const OCID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const DISPUTE_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088";
const SETTLEMENT_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072";
const DRIVER_PAY_EXPENSE_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f9001";
const CORRECTION_RECOVERY_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f9002";

function installClient() {
  mocked.withCurrentUserMock.mockImplementation(async (_userId: string, fn: (client: unknown) => Promise<unknown>) => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    return fn(client);
  });
}

describe("createCorrectiveJournalEntry (ACCT-F5616)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves Dr driver_pay_expense / Cr settlement_dispute_correction_recovery via role, not an arbitrary account pick", async () => {
    installClient();
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.resolveRoleAccountOptionalMock.mockImplementation(async (_client: unknown, _ocid: string, role: string) => {
      if (role === "driver_pay_expense") return DRIVER_PAY_EXPENSE_ID;
      if (role === "settlement_dispute_correction_recovery") return CORRECTION_RECOVERY_ID;
      return null;
    });
    mocked.createJournalEntryMock.mockResolvedValue({ id: "je-1" });

    const jeId = await createCorrectiveJournalEntry({
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
    const postings = mocked.createJournalEntryMock.mock.calls[0][0].postings;
    expect(postings).toEqual([
      expect.objectContaining({ account_id: DRIVER_PAY_EXPENSE_ID, debit_or_credit: "debit", amount_cents: 40000 }),
      expect.objectContaining({ account_id: CORRECTION_RECOVERY_ID, debit_or_credit: "credit", amount_cents: 40000 }),
    ]);
  });

  it("fails closed (throws) when settlement_dispute_correction_recovery is undesignated -- never falls back to an arbitrary account", async () => {
    installClient();
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.resolveRoleAccountOptionalMock.mockImplementation(async (_client: unknown, _ocid: string, role: string) =>
      role === "driver_pay_expense" ? DRIVER_PAY_EXPENSE_ID : null
    );

    await expect(
      createCorrectiveJournalEntry({
        actorUserId: "user-1",
        actorRole: "Owner",
        operatingCompanyId: OCID,
        disputeId: DISPUTE_ID,
        settlementId: SETTLEMENT_ID,
        amountCents: 40000,
        resolutionNotes: "Approved: wrong deduction reversed per driver evidence",
      })
    ).rejects.toThrow("E_CORRECTIVE_JE_ACCOUNTS_MISSING");
    expect(mocked.createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("posts nothing and returns null when SETTLEMENT_GL_POSTING flag is OFF (checked before any account resolution)", async () => {
    installClient();
    mocked.isEnabledMock.mockResolvedValue(false);

    const jeId = await createCorrectiveJournalEntry({
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
    expect(mocked.createJournalEntryMock).not.toHaveBeenCalled();
  });
});
