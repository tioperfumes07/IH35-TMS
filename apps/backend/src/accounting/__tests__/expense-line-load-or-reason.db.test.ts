/**
 * LEAD 443.105 #2 — real Postgres: for a company that enforces line categorization, a line of a live expense carries its
 * load or a load_exemption_reason (accounting.refuse_expense_line_without_load_or_reason, deferred to commit). A company
 * that does not enforce (the QBO mirrors) and a voided expense are left alone. Every fixture lives in ONE transaction that
 * is rolled back — nothing is left behind. The deferred check is fired early with SET CONSTRAINTS ... IMMEDIATE.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense line — load or exemption reason (real Postgres)", () => {
  it("refuses a no-load, no-reason line of an enforcing company; accepts a reason; ignores non-enforcing and voided", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");

      const fixture = async (enforce: boolean) =>
        (
          await db.query<{ opco: string; expense: string; account: string; item: string }>(
            `WITH c AS (INSERT INTO org.companies (code, legal_name, company_type, enforce_line_categorization)
                        VALUES ('LR-' || substr(md5(random()::text), 1, 8), '443.105 load-or-reason test', 'operating_carrier', $1) RETURNING id),
                  a AS (INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
                        SELECT id, 'Bank fees 443.105', 'Expense', '96301' FROM c RETURNING id, operating_company_id),
                  cat AS (INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) SELECT id, 'LRCAT', 'LR category' FROM c RETURNING id),
                  it AS (INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id)
                         SELECT a.operating_company_id, 'Bank fee 443.105', 'Service', cat.id, a.id FROM a, cat RETURNING id),
                  e AS (INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, status, posting_status, memo)
                        SELECT id, current_date, 500, 'draft', 'unposted', '443.105 fixture' FROM c RETURNING id, operating_company_id)
             SELECT e.operating_company_id::text AS opco, e.id::text AS expense, a.id::text AS account, it.id::text AS item FROM e, a, it`,
            [enforce]
          )
        ).rows[0]!;

      const insertLine = (f: { opco: string; expense: string; account: string; item: string }, seq: number, reason: string | null) =>
        db.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
                                                 expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure, load_exemption_reason)
           VALUES ($1::uuid, $2, $3::uuid, 5, 500, 'bank fee', $4::uuid, $5::uuid, 1, 500, 'each', $6)`,
          [f.expense, seq, f.opco, f.account, f.item, reason]
        );
      const atCommit = async (label: string, fn: () => Promise<unknown>) => {
        await db.query(`SAVEPOINT ${label}`);
        try {
          await fn();
          await db.query("SET CONSTRAINTS accounting.trg_expense_line_load_or_reason IMMEDIATE");
          await db.query("SET CONSTRAINTS accounting.trg_expense_line_load_or_reason DEFERRED");
          await db.query(`RELEASE SAVEPOINT ${label}`);
          return null;
        } catch (e) {
          await db.query(`ROLLBACK TO SAVEPOINT ${label}`);
          return e as Error;
        }
      };

      const enforcing = await fixture(true);
      // No load, no reason: refused by name.
      const refused = await atCommit("no_reason", () => insertLine(enforcing, 1, null));
      expect(refused?.message).toMatch(/expense_line_load_or_reason_required/);
      // A blank reason is no reason.
      const blank = await atCommit("blank_reason", () => insertLine(enforcing, 1, "                         "));
      expect(blank).not.toBeNull();
      // With a reason: accepted.
      expect(await atCommit("with_reason", () => insertLine(enforcing, 1, "Company cost: bank wire fee, not tied to a load"))).toBeNull();

      // A non-enforcing company (QBO mirror) is never touched.
      const mirror = await fixture(false);
      expect(await atCommit("mirror", () => insertLine(mirror, 1, null))).toBeNull();

      // A voided expense is not judged.
      const voided = await fixture(true);
      await db.query(`UPDATE accounting.expenses SET status = 'void', voided_at = now() WHERE id = $1::uuid`, [voided.expense]);
      expect(await atCommit("voided", () => insertLine(voided, 1, null))).toBeNull();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
