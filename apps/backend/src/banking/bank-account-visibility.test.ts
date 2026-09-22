import { describe, expect, it, vi } from "vitest";
import { activateBankAccountForEntity } from "./bank-account-visibility.js";

// ACCT-F30223-DEACTIVATED / ACCT-F30223-VISIBLE — live-confirmed 2026-09-23 on the real USMCA Amex
// row (banking.bank_accounts id 9564ca46…): the original inline activate handler (PR #22206) set
// only is_active, never deactivated_at or visible. That row ALSO carried deactivated_at set (from
// 2026-09-01), so activating it threw 23514 against ck_bank_accounts_deactivated_implies_inactive
// (migration 202610280000, BANK-F14: "a deactivated account may not also be is_active") the first
// time anyone actually invoked it — and even had it not thrown, visible would have stayed false,
// so the "activated" account still would not render in Banking. This test proves both are fixed.
describe("activateBankAccountForEntity", () => {
  it("clears deactivated_at and sets visible=true alongside is_active, in one UPDATE", async () => {
    let capturedSql = "";
    let capturedValues: unknown[] = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("UPDATE banking.bank_accounts")) {
          capturedSql = sql;
          capturedValues = values ?? [];
          return {
            rows: [
              {
                id: "9564ca46-a68f-4abc-84e5-178ac38e8d19",
                operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
                account_name: "Amex-Scentsx",
                display_name: "Amex-Scentsx",
                institution_name: "American Express",
                is_active: true,
                visible: true,
              },
            ],
          };
        }
        // appendCrudAudit's own insert
        return { rows: [] };
      }),
    };

    const result = await activateBankAccountForEntity(client as never, {
      bankAccountId: "9564ca46-a68f-4abc-84e5-178ac38e8d19",
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      actorUserId: "e4117991-d2c0-406d-8cda-74e98d95bccd",
      accountName: "Amex-Scentsx",
      institutionName: "American Express",
    });

    expect(capturedSql).toContain("is_active = true");
    expect(capturedSql).toContain("visible = true");
    expect(capturedSql).toContain("deactivated_at = NULL");
    // Never re-maps the GL account — activation must not touch ledger_account_id.
    expect(capturedSql).not.toContain("ledger_account_id");
    expect(capturedValues).toEqual([
      "Amex-Scentsx",
      "American Express",
      "9564ca46-a68f-4abc-84e5-178ac38e8d19",
      "5c854333-6ea5-4faa-af31-67cb272fef80",
    ]);
    expect(result).toMatchObject({ is_active: true, visible: true });
  });

  it("returns null when the row is not found (never throws a fake success)", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const result = await activateBankAccountForEntity(client as never, {
      bankAccountId: "00000000-0000-4000-8000-000000000000",
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      actorUserId: "e4117991-d2c0-406d-8cda-74e98d95bccd",
      accountName: "Doesn't Matter",
    });
    expect(result).toBeNull();
  });
});
