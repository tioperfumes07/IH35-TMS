/**
 * 443.67 G3 / 443.100 row 816 — real Postgres: an enforcing company's bill line posted to an account other than its
 * item's default is refused by accounting.enforce_line_categorization unless it carries item_account_override_reason,
 * and the app's pre-INSERT check (assertLineAccountMatchesItem) reads org.companies.enforce_line_categorization and
 * gives the same verdict. Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { assertLineAccountMatchesItem, LineCategorizationError, lineCategorizationRefusal } from "../line-categorization.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("line categorization — item account override reason (real Postgres)", () => {
  it("refuses an off-item account without a reason, accepts it with one; the app check agrees", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const f = (
        await db.query<{ opco: string; bill: string; item: string; item_account: string; other_account: string }>(`
          WITH c AS (INSERT INTO org.companies (code, legal_name, company_type, enforce_line_categorization)
                     VALUES ('G3T-' || substr(md5(random()::text), 1, 8), 'G3 line categorization test', 'operating_carrier', true) RETURNING id),
               a1 AS (INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
                      SELECT id, 'Repairs G3', 'Expense', '96001' FROM c RETURNING id, operating_company_id),
               a2 AS (INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
                      SELECT id, 'Tires G3', 'Expense', '96002' FROM c RETURNING id),
               cat AS (INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) SELECT id, 'G3CAT', 'G3 category' FROM c RETURNING id),
               it AS (INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id)
                      SELECT a1.operating_company_id, 'Repair G3', 'Service', cat.id, a1.id FROM a1, cat RETURNING id),
               v AS (INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) SELECT id, 'G3 vendor', 'other' FROM c RETURNING id),
               b AS (INSERT INTO accounting.bills (operating_company_id, vendor_id, bill_date, amount_cents, total_amount)
                     SELECT c.id, v.id, current_date, 2500, 25 FROM c, v RETURNING id, operating_company_id)
          SELECT b.operating_company_id::text AS opco, b.id::text AS bill, it.id::text AS item,
                 a1.id::text AS item_account, a2.id::text AS other_account
            FROM b, it, a1, a2`)
      ).rows[0]!;

      const insertLine = (reason: string | null) =>
        db.query<{ item_account_override_reason: string | null }>(
          `INSERT INTO accounting.bill_lines (bill_id, line_sequence, operating_company_id, amount, account_id, item_id,
                                              quantity, rate_cents, unit_of_measure, item_account_override_reason)
           VALUES ($1::uuid, 1, $2::uuid, 25, $3::uuid, $4::uuid, 1, 2500, 'each', $5)
           RETURNING item_account_override_reason`,
          [f.bill, f.opco, f.other_account, f.item, reason]
        );

      // App check reads enforce_line_categorization and refuses before any INSERT.
      const appErr = await assertLineAccountMatchesItem(db as never, {
        operatingCompanyId: f.opco, side: "expense", itemId: f.item, accountId: f.other_account, overrideReason: null,
      }).catch((e) => e);
      expect(appErr).toBeInstanceOf(LineCategorizationError);
      await expect(
        assertLineAccountMatchesItem(db as never, {
          operatingCompanyId: f.opco, side: "expense", itemId: f.item, accountId: f.item_account, overrideReason: null,
        })
      ).resolves.toBeUndefined();

      // The trigger refuses the same line, and its refusal maps to the same 422 body.
      await db.query("SAVEPOINT no_reason");
      const dbErr = await insertLine(null).catch((e) => e);
      await db.query("ROLLBACK TO SAVEPOINT no_reason");
      expect(lineCategorizationRefusal(dbErr)).toMatchObject({ error: "line_account_differs_from_item", field: "item_account_override_reason" });

      // With a reason the line posts and keeps it.
      const ok = await insertLine("Owner: tires billed on repairs per vendor invoice");
      expect(ok.rows[0]?.item_account_override_reason).toBe("Owner: tires billed on repairs per vendor invoice");
      await expect(
        assertLineAccountMatchesItem(db as never, {
          operatingCompanyId: f.opco, side: "expense", itemId: f.item, accountId: f.other_account,
          overrideReason: "Owner: tires billed on repairs per vendor invoice",
        })
      ).resolves.toBeUndefined();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
