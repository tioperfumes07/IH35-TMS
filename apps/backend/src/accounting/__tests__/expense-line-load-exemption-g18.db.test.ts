/**
 * LEAD 443.105 #2 — real Postgres: the shared writer rule (resolveLineLoadExemption) never exempts a load-REQUIRED line.
 * A G18 category line (diesel) with no load: the rule returns no reason, so accounting.enforce_load_fk_invariant refuses it
 * by name (E_LOAD_FK_REQUIRED). A non-G18 line with no load gets a company-cost reason the same trigger accepts. One
 * transaction, rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { resolveLineLoadExemption } from "../expense-line-load-exemption.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense line — a load-required (G18) line is never auto-exempted (real Postgres)", () => {
  it("diesel with no load and no reason is refused; a company-cost line with the derived reason is accepted", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const f = (
        await db.query<{ opco: string; expense: string; account: string; item: string }>(
          `WITH c AS (INSERT INTO org.companies (code, legal_name, company_type, enforce_line_categorization)
                      VALUES ('G18-' || substr(md5(random()::text), 1, 8), '443.105 G18 test', 'operating_carrier', true) RETURNING id),
                a AS (INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
                      SELECT id, 'Diesel 443.105', 'Expense', '95101' FROM c RETURNING id, operating_company_id),
                cat AS (INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) SELECT id, 'G18CAT', 'G18 category' FROM c RETURNING id),
                it AS (INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id)
                       SELECT a.operating_company_id, 'Diesel 443.105', 'Service', cat.id, a.id FROM a, cat RETURNING id),
                e AS (INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, status, posting_status, memo)
                      SELECT id, current_date, 500, 'draft', 'unposted', '443.105 G18 fixture' FROM c RETURNING id, operating_company_id)
           SELECT e.operating_company_id::text AS opco, e.id::text AS expense, a.id::text AS account, it.id::text AS item FROM e, a, it`
        )
      ).rows[0]!;
      const insert = (lineCategory: string | null, reason: string | null) =>
        db.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
                                                 expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure, line_category,
                                                 load_exemption_reason)
           VALUES ($1::uuid, 1, $2::uuid, 5, 500, 'line', $3::uuid, $4::uuid, 1, 500, 'each', $5, $6)`,
          [f.expense, f.opco, f.account, f.item, lineCategory, reason]
        );

      // G18 diesel, no load, no caller reason: the rule gives NO reason, and the existing trigger refuses by name.
      const g18Reason = resolveLineLoadExemption({ loadId: null, reason: null, loadRequired: true, accountLabel: "95101 Diesel", context: "expense test" });
      expect(g18Reason).toBeNull();
      await db.query("SAVEPOINT g18");
      await expect(insert("diesel", g18Reason)).rejects.toThrow(/E_LOAD_FK_REQUIRED/);
      await db.query("ROLLBACK TO SAVEPOINT g18");

      // Not load-required: the derived company-cost reason clears the same trigger (>= 20 chars).
      const companyReason = resolveLineLoadExemption({ loadId: null, accountLabel: "6300 Bank Service Charges", context: "bank line test" });
      await db.query("SAVEPOINT company");
      await expect(insert(null, companyReason)).resolves.toBeTruthy();
      await db.query("RELEASE SAVEPOINT company");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
