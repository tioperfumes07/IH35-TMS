import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  queryMock: vi.fn(),
  resolveRoleAccountMock: vi.fn(),
  createJournalEntryMock: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mocked.queryMock }) => Promise<unknown>) =>
    fn({ query: mocked.queryMock }),
}));

vi.mock("../../coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: mocked.resolveRoleAccountMock,
}));

vi.mock("../../journal-entries.service.js", () => ({
  createJournalEntry: mocked.createJournalEntryMock,
}));

import { depositEscrow, releaseEscrow } from "../service.js";

describe("escrow service balance math", () => {
  beforeEach(() => {
    mocked.queryMock.mockReset();
    mocked.resolveRoleAccountMock.mockReset();
    mocked.createJournalEntryMock.mockReset();
  });

  it("posts deposit and returns updated balance", async () => {
    mocked.resolveRoleAccountMock.mockResolvedValue("cash-account");
    mocked.createJournalEntryMock.mockResolvedValue({ id: "je-1" });
    mocked.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.escrow_accounts") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: "escrow-1",
              operating_company_id: "oc-1",
              holder_id: "driver-1",
              holder_type: "driver",
              purpose: "driver_bond",
              coa_account_id: "escrow-liability",
              balance_cents: 10000,
              status: "active",
              created_at: "",
              updated_at: "",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO accounting.escrow_postings")) {
        return {
          rows: [
            {
              id: "posting-1",
              operating_company_id: "oc-1",
              escrow_account_id: "escrow-1",
              posting_type: "deposit",
              amount_cents: 5000,
              source_type: "manual",
              source_id: null,
              note: null,
              posted_at: "",
              posted_by_user_id: "user-1",
              linked_journal_entry_id: "je-1",
              created_at: "",
            },
          ],
        };
      }
      if (sql.includes("SELECT balance_cents::bigint")) return { rows: [{ balance_cents: 15000 }] };
      if (sql.includes("appendCrudAudit")) return { rows: [] };
      return { rows: [] };
    });

    const result = await depositEscrow(
      {
        operating_company_id: "oc-1",
        escrow_account_id: "escrow-1",
        amount_cents: 5000,
        source_type: "manual",
      },
      { userId: "user-1", role: "Accountant" }
    );

    expect(mocked.createJournalEntryMock).toHaveBeenCalledOnce();
    expect(result.balance_cents).toBe(15000);
  });

  it("rejects release above available balance", async () => {
    mocked.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.escrow_accounts") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: "escrow-1",
              operating_company_id: "oc-1",
              holder_id: "driver-1",
              holder_type: "driver",
              purpose: "driver_bond",
              coa_account_id: "escrow-liability",
              balance_cents: 10000,
              status: "active",
              created_at: "",
              updated_at: "",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      releaseEscrow(
        {
          operating_company_id: "oc-1",
          escrow_account_id: "escrow-1",
          amount_cents: 12000,
          source_type: "manual",
        },
        { userId: "user-1", role: "Accountant" }
      )
    ).rejects.toThrow("escrow_release_exceeds_balance");
  });
});
