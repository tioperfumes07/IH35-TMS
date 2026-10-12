// Real Postgres proof for check-account-rules.service.ts -- CI-gated (GITHUB_ACTIONS).
// 443.91 #4: the CI database is FRESH (migrations only) — it has no USMCA company, no live bank account, no live item. The
// suite used to read live USMCA ids ("Live-verified 09-25-2026") and so could never pass in CI. It now builds its own
// isolated company (createIsolatedOperatingCompany, the canonical helper) with exactly the rows the engine reads: a
// depository bank account on a ledger account, an item with a default expense account, and two expense-category map
// entries (maintenance/maintenance -> CostOfGoodsSold, revenue/linehaul -> Income). The engine is unchanged.
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import pg from "pg";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany } from "../../../../test-helpers/isolated-company.js";
import { resolveCheckBankAccount, resolveCheckLineDebitAccount, assertNotDriverAdvanceCheck, CheckAccountError } from "../check-account-rules.service.js";

let USMCA_COMPANY_ID = "";
let USMCA_BOA_CHECKING = "";
let REAL_ITEM_ID = "";

const runDb = process.env.GITHUB_ACTIONS === "true";

beforeAll(async () => {
  if (!runDb) return;
  const { companyId } = await createIsolatedOperatingCompany({ codePrefix: "CHK", legalNamePrefix: "Check rules fixture" });
  USMCA_COMPANY_ID = companyId;
  const client = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? ""));
  await client.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    const acct = async (number: string, name: string, type: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid, $2, $3, $4, true) RETURNING id::text`, [companyId, number, name, type])).rows[0]!.id;
    const bankLedger = await acct("1000", "Checking", "Asset");
    const cogs = await acct("5300", "Repairs & Maintenance", "CostOfGoodsSold");
    const income = await acct("4000", "Linehaul Revenue", "Income");
    USMCA_BOA_CHECKING = (await client.query<{ id: string }>(
      `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_class, is_active, ledger_account_id, sync_status)
       VALUES ($1::uuid, 'Fixture Checking', 'depository', true, $2::uuid, 'active') RETURNING id::text`, [companyId, bankLedger])).rows[0]!.id;
    REAL_ITEM_ID = (await client.query<{ id: string }>(
      `INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id)
       VALUES ($1::uuid, 'Fixture Repair', 'Service', $2::uuid) RETURNING id::text`, [companyId, cogs])).rows[0]!.id;
    await client.query(
      `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side)
       VALUES ($1::uuid, 'maintenance', 'maintenance', $2::uuid, 'debit'), ($1::uuid, 'revenue', 'linehaul', $3::uuid, 'debit')`,
      [companyId, cogs, income]);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}, 60_000);

afterAll(() => undefined);

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
