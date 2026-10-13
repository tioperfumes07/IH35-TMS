/**
 * LEAD 443.129 D / Codex AJK-08 — real Postgres: a road-service ticket POSTS OR NOTHING. Creating its work order + bill
 * marks the ticket 'invoiced', so its bill must be GL-posted in the same transaction:
 *
 *  - the company's bill GL posting flag is OFF -> WoBillGlPostingDisabledError; no WO, no bill, ticket stays open;
 *  - the poster refuses (no A/P control role bound) -> PostingEngineError propagates; no WO, no bill, no JE, ticket open;
 *  - roles bound + flag ON -> WO + bill + balanced JE, ticket 'invoiced' with its bill.
 *
 * Old code caught the PostingEngineError (audited 'gl_post_failed') and invoiced the ticket on an unposted bill, and with
 * the flag OFF it invoiced the ticket on a bill that never posts. The company + its maintenance category map are committed
 * (the bill-line account resolver reads them on its own connection) and the company is deactivated afterwards; every other
 * fixture lives in ONE transaction that is rolled back.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany, insertMaintenanceCategoryMap } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createWorkOrderFromRoadServiceTicket } from "../road-service/wo-integration.js";
import { createExpenseInClientTx } from "../../accounting/expense-writer.service.js";
import { WoBillGlPostingDisabledError } from "../two-section-service.js";
import { PostingEngineError } from "../../accounting/posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("road-service ticket posts or nothing (443.129 D / AJK-08, real Postgres)", () => {
  it("flag off -> refused; poster refusal -> nothing written; posted -> invoiced", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    // Committed: the isolated company, its expense account and its maintenance category map.
    const opco = (await createIsolatedOperatingCompany({ codePrefix: "RSP", legalNamePrefix: "Road service posts-or-nothing" })).companyId;
    const tag = `RSP${Date.now().toString(36).toUpperCase()}`;
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const repairAccount = (await db.query<{ id: string }>(
      `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
       VALUES ($1, 'RSP road service repair', 'Expense', $2, true) RETURNING id::text AS id`,
      [opco, `${tag.slice(-5)}1`]
    )).rows[0]!.id;
    await insertMaintenanceCategoryMap(db, opco, repairAccount);
    await db.query("COMMIT");
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const unit = (await one(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}-U1`, `VIN${tag}`.slice(0, 17), opco]
      )).id;
      const category = (await one(
        `INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'road_service_repair', 'Road service repair') RETURNING id::text AS id`,
        [opco]
      )).id;
      // 443.129 C (AJK-07) — the ticket names its item (category + expense account); a category is never guessed.
      const item = (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, category_id, default_expense_account_id) VALUES ($1, 'Service', $2, $3, $4) RETURNING id::text AS id`,
        [opco, `${tag} road service repair`, category, repairAccount]
      )).id;
      const vendor = (await one(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'RSP Towing', 'other') RETURNING id::text AS id`,
        [opco]
      )).id;
      const ticket = async (n: string) =>
        (await one(
          `INSERT INTO maintenance.road_service_tickets (operating_company_id, ticket_number, vendor_name, vendor_id, unit_id, service_type, total_cost_cents, status, item_id)
           VALUES ($1, $2, 'RSP Towing', $3, $4, 'tow', 25000, 'completed', $5) RETURNING id::text AS id`,
          [opco, `${tag}-${n}`, vendor, unit, item]
        )).id;
      const setFlag = async (enabled: boolean) => {
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
           VALUES ('BILL_GL_POSTING_ENABLED', $1::uuid, $2, $3::uuid)
           ON CONFLICT (flag_key, operating_company_id) WHERE operating_company_id IS NOT NULL AND user_uuid IS NULL
           DO UPDATE SET enabled = EXCLUDED.enabled`,
          [opco, enabled, TEST_OWNER_USER_ID]
        );
      };
      const state = async (ticketId: string) => ({
        ticket: (await one<{ status: string; wo_id: string | null; bill_id: string | null }>(
          `SELECT status, wo_id::text AS wo_id, bill_id::text AS bill_id FROM maintenance.road_service_tickets WHERE id = $1`, [ticketId])),
        wos: (await one<{ n: number }>(`SELECT count(*)::int AS n FROM maintenance.work_orders WHERE operating_company_id = $1`, [opco])).n,
        bills: (await one<{ n: number }>(`SELECT count(*)::int AS n FROM accounting.bills WHERE operating_company_id = $1`, [opco])).n,
        postings: (await one<{ n: number }>(`SELECT count(*)::int AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1`, [opco])).n,
      });
      const create = (ticketId: string) =>
        createWorkOrderFromRoadServiceTicket(db as never, TEST_OWNER_USER_ID, { operatingCompanyId: opco, ticketId, writeExpense: createExpenseInClientTx as never });

      // 1. Flag OFF: refused by name, nothing written, ticket not invoiced.
      const t1 = await ticket("T1");
      await setFlag(false);
      await db.query("SAVEPOINT flag_off");
      const off = await create(t1).catch((e) => e);
      expect(off).toBeInstanceOf(WoBillGlPostingDisabledError);
      await db.query("ROLLBACK TO SAVEPOINT flag_off");
      expect(await state(t1)).toMatchObject({ ticket: { status: "completed", wo_id: null, bill_id: null }, wos: 0, bills: 0, postings: 0 });

      // 2. Flag ON, no A/P control role: the poster refuses and the refusal propagates — nothing written.
      await setFlag(true);
      await db.query("SAVEPOINT refused");
      const refused = await create(t1).catch((e) => e);
      expect(refused).toBeInstanceOf(PostingEngineError);
      await db.query("ROLLBACK TO SAVEPOINT refused");
      expect(await state(t1)).toMatchObject({ ticket: { status: "completed", wo_id: null, bill_id: null }, wos: 0, bills: 0, postings: 0 });

      // 3. Roles bound: the bill posts in the same transaction and only then is the ticket invoiced.
      const ap = (await one(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
         VALUES ($1, 'RSP A/P control', 'Liability', $2, true) RETURNING id::text AS id`,
        [opco, `${tag.slice(-5)}2`]
      )).id;
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'ap_control', $2, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
        [opco, ap]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'uncategorized_expense', $2, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
        [opco, repairAccount]
      );
      const ok = await create(t1);
      expect(ok.bill_id).toBeTruthy();
      const after = await state(t1);
      expect(after.ticket.status).toBe("invoiced");
      expect(after.ticket.bill_id).toBe(ok.bill_id);
      expect(after.bills).toBe(1);
      expect(after.postings).toBeGreaterThan(0);
      const net = (await one<{ net: string }>(
        `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1 AND source_transaction_type = 'bill' AND source_transaction_id = $2`,
        [opco, ok.bill_id]
      )).net;
      expect(Number(net)).toBe(0);
    } finally {
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await deactivateIsolatedOperatingCompany(db, opco);
      await db.query("COMMIT");
      await db.end();
    }
  });
});
