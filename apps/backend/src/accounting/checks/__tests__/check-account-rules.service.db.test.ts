// Real Postgres proof for check-account-rules.service.ts -- CI-gated (GITHUB_ACTIONS), real USMCA
// company id, same rationale as check-payee.service.db.test.ts and the R-153 accept-bill-match tests.
import { describe, it, expect } from "vitest";
import { resolveCheckBankAccount, resolveCheckLineDebitAccount, assertNotDriverAdvanceCheck, CheckAccountError } from "../check-account-rules.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Live-verified 09-25-2026.
const USMCA_BOA_CHECKING = "e83028a5-dcda-4233-b660-5b9923b3d39c"; // depository, ledger_account_id -> 1000
const REAL_ITEM_ID = "aa07ce99-127c-4a29-af59-68d2bb694ff6"; // has default_expense_account_id

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("check-account-rules.service (real Postgres)", () => {
  it(
    "resolves the real USMCA checking account as a valid check bank account",
    async () => {
      const acct = await resolveCheckBankAccount(USMCA_COMPANY_ID, USMCA_BOA_CHECKING);
      expect(acct.bank_account_id).toBe(USMCA_BOA_CHECKING);
      expect(acct.ledger_account_id.length).toBeGreaterThan(0);
    },
    30_000
  );

  it(
    "resolves a real mapped expense category (maintenance/maintenance) to a CostOfGoodsSold account",
    async () => {
      const resolved = await resolveCheckLineDebitAccount(USMCA_COMPANY_ID, {
        line_kind: "category",
        category_kind: "maintenance",
        category_code: "maintenance",
      });
      expect(resolved.method).toBe("expense_category_map");
      expect(resolved.account_id.length).toBeGreaterThan(0);
    },
    30_000
  );

  it(
    "refuses a category that maps to a revenue account (accessorial-style income, never a check debit)",
    async () => {
      await expect(
        resolveCheckLineDebitAccount(USMCA_COMPANY_ID, {
          line_kind: "category",
          category_kind: "revenue",
          category_code: "linehaul",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT_TYPE" });
    },
    30_000
  );

  it(
    "refuses an unmapped category with CATEGORY_UNMAPPED, never a guessed account",
    async () => {
      await expect(
        resolveCheckLineDebitAccount(USMCA_COMPANY_ID, {
          line_kind: "category",
          category_kind: "other",
          category_code: "definitely-not-a-real-mapped-code-zz",
        })
      ).rejects.toMatchObject({ code: "CATEGORY_UNMAPPED" });
    },
    30_000
  );

  it(
    "resolves a real item's default_expense_account_id",
    async () => {
      const resolved = await resolveCheckLineDebitAccount(USMCA_COMPANY_ID, { line_kind: "item", item_id: REAL_ITEM_ID });
      expect(resolved.method).toBe("item_expense_account");
      expect(resolved.account_id.length).toBeGreaterThan(0);
    },
    30_000
  );

  it("refuses a driver check on the cash-advance category before any database call", () => {
    expect(() => assertNotDriverAdvanceCheck("driver", "cash_advance")).toThrowError(CheckAccountError);
    try {
      assertNotDriverAdvanceCheck("driver", "cash_advance");
      throw new Error("expected assertNotDriverAdvanceCheck to throw");
    } catch (err) {
      expect((err as CheckAccountError).code).toBe("DRIVER_ADVANCE_IS_A_BILL_PAYMENT");
    }
  });

  it("does not refuse a driver reimbursement (non-cash-advance category)", () => {
    expect(() => assertNotDriverAdvanceCheck("driver", "maintenance")).not.toThrow();
  });

  it("does not refuse a vendor check even on the cash-advance category (rule is driver-specific)", () => {
    expect(() => assertNotDriverAdvanceCheck("vendor", "cash_advance")).not.toThrow();
  });
});
