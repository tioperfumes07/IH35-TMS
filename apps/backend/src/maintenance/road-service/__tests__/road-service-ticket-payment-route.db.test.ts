/**
 * LEAD 443.129 A / B / C (Codex AJK-02, AJK-06, AJK-07) — real Postgres, the roadside ticket -> work order engine.
 *   A: a card-paid ticket becomes ONE expense on that card (no bill); an advance-paid ticket becomes ONE expense paid out
 *      of the driver's advance account (no bill); only a vendor-invoice ticket makes an A/P bill.
 *   B: the ticket, its work order and its document carry the load the truck was running at the event time, that load's
 *      trailer and driver — or the explicit no-load reason when no load covered the truck.
 *   C: the ticket names its item; no item -> refused by name, nothing written. Never a guessed category.
 * Old code: every ticket became a vendor bill whatever the payment method, with no load / trailer, under the OLDEST
 * category of the company.
 *
 * The company is an isolated one (createIsolatedOperatingCompany, deactivated after); everything else runs in ONE
 * rolled-back transaction.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { prepareCompanyForLoadInserts } from "../../../../test-helpers/db-fixture.js";
import { createExpenseInClientTx } from "../../../accounting/expense-writer.service.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany, insertMaintenanceCategoryMap } from "../../../../test-helpers/isolated-company.js";
import {
  createWorkOrderFromRoadServiceTicket,
  roadServicePaymentRoute,
  RoadServiceTicketRefused,
} from "../wo-integration.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("roadside ticket payment route + linkage + item (443.129 A/B/C, real Postgres)", () => {
  let db: pg.Client;
  let opco = "";

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    opco = (await createIsolatedOperatingCompany({ codePrefix: "RST", legalNamePrefix: "Roadside ticket test" })).companyId;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    // The WO -> vendor bill copy resolves its line account through the company's maintenance category map on its OWN
    // connection (withLuciaBypass), so the map is committed for the isolated company (deactivated in afterAll).
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const mapAccount = (await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_type, account_name) VALUES ($1, '6992', 'Expense', 'RST maintenance map') RETURNING id::text AS id`,
        [opco])).rows[0]!.id;
      await insertMaintenanceCategoryMap(db, opco, mapAccount);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });

  afterAll(async () => {
    if (opco && db) {
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await deactivateIsolatedOperatingCompany(db, opco);
        await db.query("COMMIT");
      } catch (err) {
        // A failed teardown must surface (verify-aggregate-savepoints).
        await db.query("ROLLBACK");
        throw err;
      }
    }
    await db?.end();
  });

  it("card -> card expense, advance -> advance expense, vendor invoice -> one bill; linkage stamped; no item refused", async () => {
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    const count = async (sql: string, params: unknown[]) => Number((await one<{ n: string }>(sql, params)).n);
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const tag = `RST${Date.now().toString(36).toUpperCase()}`;
      const trailerType = await prepareCompanyForLoadInserts(db as never, opco);

      const account = async (number: string, type: string, subtype: string | null, name: string) =>
        (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_number, account_type, account_subtype, account_name) VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [opco, number, type, subtype, `${tag} ${name}`])).id;
      const repairAccount = await account("6991", "Expense", null, "Roadside repair");
      const cardAccount = await account("2991", "Liability", "CreditCard", "Fuel card");
      const advanceAccount = await account("1991", "Asset", "Employee Cash Advances", "Driver advance");
      const category = (await one(`INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, $2, 'Roadside repair') RETURNING id::text AS id`,
        [opco, `${tag}-RR`])).id;
      const item = (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, category_id, default_expense_account_id) VALUES ($1, 'Service', $2, $3, $4) RETURNING id::text AS id`,
        [opco, `${tag} roadside repair`, category, repairAccount])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'Vendor') RETURNING id::text AS id`,
        [opco, `${tag} Roadside Co`])).id;
      const unit = async (n: string) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
          [`${tag}-${n}`, `1RST${tag.slice(-6)}${n}`.padEnd(17, "0").slice(0, 17), opco])).id;
      const driver = async (n: string) =>
        (await one(`INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id) VALUES ($1, 'Road', '5550000000', $2, $3::uuid) RETURNING id::text AS id`,
          [`${tag}${n}`, `${tag.toLowerCase()}${n}@example.test`, opco])).id;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const truck = await unit("U1");
      const loadDriver = await driver("D1");
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text AS id`,
        [opco, `${tag}L`, customer, TEST_OWNER_USER_ID, trailerType, truck, loadDriver])).id;
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
         VALUES ($1::uuid, 1, 'pickup', ('2026-10-05 08:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-10-05 09:00'::timestamp AT TIME ZONE '${TZ}')),
                ($1::uuid, 2, 'delivery', ('2026-10-07 15:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-10-07 16:00'::timestamp AT TIME ZONE '${TZ}'))`,
        [load]);
      const trailer = (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`,
        [`${tag}-T1`, opco])).id;
      await db.query(
        `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id) VALUES ($1, $2, 'full_form', $3, $4)`,
        [opco, load, TEST_OWNER_USER_ID, trailer]);
      await db.query(`INSERT INTO driver_finance.driver_advance_accounts (operating_company_id, driver_id, coa_account_id) VALUES ($1, $2, $3)`,
        [opco, loadDriver, advanceAccount]);

      const ticket = async (n: string, paymentMethod: string, onScene: string, opts: { item?: string | null; card?: string | null } = {}) =>
        (await one(
          `INSERT INTO maintenance.road_service_tickets (operating_company_id, ticket_number, vendor_name, vendor_id, unit_id, service_type, payment_method,
             on_scene_time, total_cost_cents, status, item_id, payment_account_uuid)
           VALUES ($1, $2, 'Roadside Co', $3, $4, 'tire_change', $5, ($6::timestamp AT TIME ZONE '${TZ}'), 45000, 'completed', $7, $8) RETURNING id::text AS id`,
          [opco, `${tag}-${n}`, vendor, truck, paymentMethod, onScene, opts.item === undefined ? item : opts.item, opts.card ?? null])).id;
      const run = (ticketId: string, extra: { itemId?: string | null; paymentAccountUuid?: string | null } = {}) =>
        createWorkOrderFromRoadServiceTicket(db as never, TEST_OWNER_USER_ID, { operatingCompanyId: opco, ticketId, writeExpense: createExpenseInClientTx as never, ...extra });
      const refusal = async (p: Promise<unknown>) => {
        try { await p; return null; } catch (e) { return e instanceof RoadServiceTicketRefused ? e.code : String(e); }
      };

      // C — no item: refused by name, nothing written.
      const noItem = await ticket("NOITEM", "vendor_bill", "2026-10-06 12:00", { item: null });
      expect(await refusal(run(noItem))).toBe("road_service_item_required");
      expect(await count(`SELECT count(*) n FROM maintenance.work_orders WHERE operating_company_id = $1`, [opco])).toBe(0);
      expect(await count(`SELECT count(*) n FROM maintenance.road_service_tickets WHERE id = $1 AND wo_id IS NULL AND load_id IS NULL`, [noItem])).toBe(1);

      // A — a card-paid ticket without its card account: refused by name, nothing written.
      const cardNoAccount = await ticket("CARD0", "cc", "2026-10-06 12:00");
      expect(await refusal(run(cardNoAccount))).toBe("road_service_card_account_required");
      expect(await count(`SELECT count(*) n FROM maintenance.work_orders WHERE operating_company_id = $1`, [opco])).toBe(0);

      // A + B — card-paid during the load: ONE expense on the card, no bill; load / trailer / driver / item stamped everywhere.
      const card = await ticket("CARD", "cc", "2026-10-06 12:00", { card: cardAccount });
      const r1 = await run(card);
      expect(r1.bill_id).toBeNull();
      expect(r1.expense_id).toBeTruthy();
      const exp1 = await one<{ payment_account_uuid: string; load_id: string; unit_id: string; trailer_id: string; driver: string; wo: string }>(
        `SELECT payment_account_uuid::text, load_id::text, unit_id::text, trailer_id::text, driver_uuid::text AS driver, linked_work_order_uuid::text AS wo
           FROM accounting.expenses WHERE id = $1`, [r1.expense_id]);
      expect(exp1).toEqual({ payment_account_uuid: cardAccount, load_id: load, unit_id: truck, trailer_id: trailer, driver: loadDriver, wo: r1.wo_id });
      const line1 = await one<{ item_id: string; account: string }>(
        `SELECT item_id::text, expense_account_uuid::text AS account FROM accounting.expense_lines WHERE expense_id = $1 LIMIT 1`, [r1.expense_id]);
      expect(line1).toEqual({ item_id: item, account: repairAccount });
      const t1 = await one<Record<string, string | null>>(
        `SELECT load_id::text, trailer_id::text, driver_id::text, item_id::text, payment_account_uuid::text, expense_id::text, bill_id::text, status, load_exemption_reason
           FROM maintenance.road_service_tickets WHERE id = $1`, [card]);
      expect(t1).toEqual({ load_id: load, trailer_id: trailer, driver_id: loadDriver, item_id: item, payment_account_uuid: cardAccount, expense_id: r1.expense_id, bill_id: null, status: "paid", load_exemption_reason: null });
      const wo1 = await one<{ load_id: string; driver_id: string }>(`SELECT load_id::text, driver_id::text FROM maintenance.work_orders WHERE id = $1`, [r1.wo_id]);
      expect(wo1).toEqual({ load_id: load, driver_id: loadDriver });
      expect(await count(`SELECT count(*) n FROM accounting.bills WHERE linked_work_order_uuid = $1`, [r1.wo_id])).toBe(0);

      // A + B — advance-paid outside any load: ONE expense paid out of the driver's advance account, no bill, no-load reason.
      const advance = await ticket("ADV", "driver_advance", "2026-10-09 12:00");
      await db.query(`UPDATE maintenance.road_service_tickets SET driver_id = $2 WHERE id = $1`, [advance, loadDriver]);
      const r2 = await run(advance);
      expect(r2.bill_id).toBeNull();
      const exp2 = await one<{ payment_account_uuid: string; load_id: string | null }>(
        `SELECT payment_account_uuid::text, load_id::text FROM accounting.expenses WHERE id = $1`, [r2.expense_id]);
      expect(exp2).toEqual({ payment_account_uuid: advanceAccount, load_id: null });
      const t2 = await one<{ load_exemption_reason: string | null }>(`SELECT load_exemption_reason FROM maintenance.road_service_tickets WHERE id = $1`, [advance]);
      expect(t2.load_exemption_reason).toMatch(/^roadside_no_load: no load covered unit /);

      // A + D — vendor invoice: exactly one A/P bill, and it posts in the same transaction or nothing is written (443.129 D):
      // bill GL posting ON and the A/P control role bound for the isolated company.
      const ap = await account("2992", "Liability", null, "A/P control");
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid) VALUES ('BILL_GL_POSTING_ENABLED', $1::uuid, true, $2::uuid)
         ON CONFLICT (flag_key, operating_company_id) WHERE operating_company_id IS NOT NULL AND user_uuid IS NULL DO UPDATE SET enabled = true`,
        [opco, TEST_OWNER_USER_ID]);
      for (const [role, acct] of [["ap_control", ap], ["uncategorized_expense", repairAccount]] as const) {
        await db.query(
          `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, $2, $3, true)
           ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
          [opco, role, acct]);
      }
      // A — vendor invoice: exactly one A/P bill, no expense. (Outside a load: accounting.refuse_driver_bill_without_links
      // (Cursor, 443.106) today treats ANY bill carrying a load as a driver bill and demands a driver on it, and a bill's
      // driver_id is its posting party — a vendor's repair bill on a load is reported to the Lead, not worked around.)
      const vendorBill = await ticket("VB", "vendor_bill", "2026-10-09 13:00");
      const r3 = await run(vendorBill);
      expect(r3.expense_id).toBeNull();
      expect(r3.bill_id).toBeTruthy();
      expect(await count(`SELECT count(*) n FROM accounting.bills WHERE linked_work_order_uuid = $1`, [r3.wo_id])).toBe(1);
      const t3 = await one<{ status: string; bill_id: string; load_exemption_reason: string | null }>(
        `SELECT status, bill_id::text, load_exemption_reason FROM maintenance.road_service_tickets WHERE id = $1`, [vendorBill]);
      expect(t3.status).toBe("invoiced");
      expect(t3.bill_id).toBe(r3.bill_id);
      expect(t3.load_exemption_reason).toMatch(/^roadside_no_load: /);
      const billNet = await one<{ n: string; net: string }>(
        `SELECT count(*)::text AS n, COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1 AND source_transaction_type = 'bill' AND source_transaction_id = $2`,
        [opco, r3.bill_id]);
      expect(Number(billNet.n)).toBeGreaterThan(0); // the bill is posted (443.129 D)
      expect(Number(billNet.net)).toBe(0);

      // Idempotent: a second call returns the existing link and writes nothing new.
      const again = await run(card);
      expect(again).toMatchObject({ already_linked: true, wo_id: r1.wo_id, expense_id: r1.expense_id });
      expect(await count(`SELECT count(*) n FROM accounting.expenses WHERE operating_company_id = $1`, [opco])).toBe(2);
    } finally {
      await db.query("ROLLBACK");
    }
  }, 120_000);

  it("an unknown payment method is refused by name (one routing decision)", () => {
    expect(roadServicePaymentRoute("cc")).toBe("card_expense");
    expect(roadServicePaymentRoute("driver_advance")).toBe("driver_advance_expense");
    expect(roadServicePaymentRoute("vendor_bill")).toBe("vendor_bill");
    expect(() => roadServicePaymentRoute("check")).toThrow(RoadServiceTicketRefused);
  });
});
