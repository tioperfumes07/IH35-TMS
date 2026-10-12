/**
 * LEAD 443.110 G14 — real Postgres: a Settlement Creator deduction posts by ITS type (the account of the item picked),
 * through the same deduction-type -> recovery-role mapping the settlement close posts with. Fixture company, accounts,
 * role bindings and items live in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { resolveCreatorDeductionType } from "../settlement-creator-deduction-type.js";
import { SettlementCreatorError } from "../settlement-creator-error.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Settlement Creator deduction posts by its type (real Postgres)", () => {
  it("fine / admin fee -> other_recovery 7200, damage -> damage_recovery, cash advance -> advance_recovery; escrow, unmapped and itemless lines refused", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const opco = (await db.query<{ id: string }>(
        `INSERT INTO org.companies (code, legal_name, company_type) VALUES ('G14-' || substr(md5(random()::text), 1, 8), 'G14 deduction types', 'operating_carrier') RETURNING id::text`
      )).rows[0]!.id;
      const account = async (num: string, name: string, type: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid, $2, $3, $4, true) RETURNING id::text`,
          [opco, num, name, type]
        )).rows[0]!.id;
      const income7200 = await account("7200", "Driver Admin Fee & Chargeback Income", "OtherIncome");
      const damage6175 = await account("6175", "Driver Accident Damages & Repairs", "Expense");
      const advance1245 = await account("1245", "Driver Cash Advances Receivable", "Asset");
      const tolls5300 = await account("5300", "Tolls & Scales", "Expense");
      const escrow2100 = await account("2100", "Driver Escrow - Held in Trust", "Liability");
      const bind = (role: string, accountId: string) =>
        db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1::uuid, $2, $3::uuid, true)`, [opco, role, accountId]);
      await bind("other_recovery", income7200);
      await bind("damage_recovery", damage6175);
      await bind("advance_recovery", advance1245);
      await bind("escrow_liability_default", escrow2100);
      const cat = (await db.query<{ id: string }>(
        `INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1::uuid, 'G14DED', 'Driver Deductions') RETURNING id::text`, [opco]
      )).rows[0]!.id;
      const item = async (name: string, accountId: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_income_account_id) VALUES ($1::uuid, $2, 'Service', $3::uuid, $4::uuid) RETURNING id::text`,
          [opco, name, cat, accountId]
        )).rows[0]!.id;
      const fineItem = await item("Driver Deduction-Fines & Violations", income7200);
      const damageItem = await item("Driver Deduction-For Accident & Damages to Equipment", damage6175);
      const advanceItem = await item("Driver Deduction-Cash Advance Wire Transfer", advance1245);
      const tollItem = await item("Highway Toll Expense-USA", tolls5300);
      const escrowItem = await item("Driver Deduction-Escrow for Claims", escrow2100);

      const resolve = (line: { item_id?: string | null; description?: string | null }) => resolveCreatorDeductionType(db as never, opco, line);
      const refusal = async (line: { item_id?: string | null; description?: string | null }) => {
        const err = await resolve(line).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(SettlementCreatorError);
        return (err as SettlementCreatorError & { code: string }).code;
      };

      expect(await resolve({ item_id: fineItem, description: "Late delivery fine" })).toMatchObject({ deductionType: "other", roleKey: "other_recovery", accountId: income7200 });
      expect(await resolve({ item_id: null, description: "Admin fee" })).toMatchObject({ deductionType: "other", accountId: income7200 });
      expect(await resolve({ item_id: damageItem, description: "Mirror" })).toMatchObject({ deductionType: "damage", roleKey: "damage_recovery", accountId: damage6175 });
      expect(await resolve({ item_id: advanceItem, description: "Wire advance" })).toMatchObject({ deductionType: "cash_advance_repayment", roleKey: "advance_recovery", accountId: advance1245 });

      // Never silently "other".
      expect(await refusal({ item_id: tollItem, description: "Toll" })).toBe("deduction_type_unmapped");
      expect(await refusal({ item_id: escrowItem, description: "Escrow" })).toBe("deduction_is_escrow");
      expect(await refusal({ item_id: null, description: "Phone" })).toBe("deduction_item_required");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
