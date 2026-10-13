/**
 * LEAD 443.121 #2 + #3 — real Postgres, one transaction rolled back:
 *  - a card fill received while NO load covered its fill time posts ON RECEIPT with the deadhead/yard reason (the old poster
 *    refused it: fuel_fill_missing_load — this test fails there at the first "posted" assertion);
 *  - booking a load whose window covers the fill attaches the SAME journal entry and the SAME expense document to it:
 *    postings keep their ids and count (load_id filled once), the document takes the load-spine number + its link row, its
 *    lines drop the reason; a fill outside every window keeps its reason;
 *  - #3: the attached document names the one live settlement holding the load (engine stamp, fill-once);
 *  - the posting's load cannot be moved again (refuse_posting_fact_update stays as strict as it is).
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { FUEL_NO_LOAD_REASON_PREFIX, postFuelFillOnReceipt } from "../../accounting/bank-recon/bank-match-fuel-post.service.js";
import { repointFuelReceiptsToLoad } from "../fuel-receipt-repoint.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("fuel receipt posts with no load, then attaches to its load (443.121 #2/#3, real Postgres)", () => {
  it("posts on receipt with the deadhead/yard reason; booking the covering load moves the same JE + document; settlement stamped", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `FRR${Date.now().toString(36).toUpperCase()}`;
      const opco = (await one(
        `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [`${tag}A`, `Fuel receipt repoint test ${tag}`]
      )).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}U`, `1FRR${tag.slice(-6)}`.padEnd(17, "0").slice(0, 17), opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Frr', 'Driver', '5555550121') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, `${tag} Dreamline`])).id;
      const fuelAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '95000') RETURNING id::text AS id`, [opco, `${tag} Fuel & Diesel`])).id;
      const payable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '92510') RETURNING id::text AS id`, [opco, `${tag} Dreamline Diesel Card Payable`])).id;
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_dreamline', $2, true)`, [opco, payable]);
      const card = (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, 'DREAMLINE', 'Dreamline', true) RETURNING id::text AS id`, [opco])).id;
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), 'EXPENSE_GL_POSTING_ENABLED', $1, NULL, true, $2, now())`, [opco, TEST_OWNER_USER_ID]);
      const fill = async (n: string, localAt: string) =>
        (await one(
          `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, load_required, driver_id, unit_id, fuel_type, gallons, price_per_gallon,
             total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
           VALUES ($1, $2, NULL, false, $3, $4, 'diesel', 50, 5, 250.00, ($5::timestamp AT TIME ZONE '${TZ}'), ($5::timestamp AT TIME ZONE '${TZ}'),
                   $6, 'import', $7, $8, 'TX') RETURNING id::text AS id`,
          [opco, vendor, driver, unit, localAt, `7121${n}`, `${tag}-fill-${n}`, card])).id;
      const inWindow = await fill("1", "2026-01-10 12:00");
      const outside = await fill("2", "2026-03-01 12:00");

      // ---- 1. received with NO load covering the fill time: posts on receipt, deadhead/yard reason -----------------
      const postings = async (fillId: string) =>
        (await db.query<{ id: string; je: string; load_id: string | null }>(
          `SELECT id::text, journal_entry_uuid::text AS je, load_id::text FROM accounting.journal_entry_postings
            WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND source_transaction_id = $2 ORDER BY id`,
          [opco, fillId])).rows;
      for (const f of [inWindow, outside]) {
        const posted = await postFuelFillOnReceipt(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: f });
        expect(posted.result).toBe("posted");
      }
      const before = await postings(inWindow);
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((p) => p.load_id === null)).toBe(true);
      const ftBefore = await one<{ reason: string | null }>(`SELECT load_exemption_reason AS reason FROM fuel.fuel_transactions WHERE id = $1::uuid`, [inWindow]);
      expect(ftBefore.reason?.startsWith(FUEL_NO_LOAD_REASON_PREFIX)).toBe(true);
      const docBefore = await one<{ id: string; load_id: string | null; expense_number: string }>(
        `SELECT id::text, load_id::text, expense_number FROM accounting.expenses WHERE source_fuel_transaction_id = $1::uuid AND voided_at IS NULL`, [inWindow]);
      expect(docBefore.load_id).toBeNull();
      const lineBefore = await one<{ reason: string | null }>(`SELECT load_exemption_reason AS reason FROM accounting.expense_lines WHERE expense_id = $1::uuid LIMIT 1`, [docBefore.id]);
      expect(lineBefore.reason).toBeTruthy();

      // ---- 2. the covering load is booked (01-09 .. 01-12) and a live settlement holds it -----------------------------
      const loadNumber = `${tag}L1`;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid) RETURNING id::text AS id`,
        [opco, loadNumber, customer, TEST_OWNER_USER_ID, trailerType, unit, driver])).id;
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
         VALUES ($1::uuid, 1, 'pickup', ('2026-01-09 08:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-01-09 09:00'::timestamp AT TIME ZONE '${TZ}')),
                ($1::uuid, 2, 'delivery', ('2026-01-12 15:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-01-12 16:00'::timestamp AT TIME ZONE '${TZ}'))`,
        [load]);
      const settlementId = randomUUID();
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model, source_document_ref)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, DATE '2026-01-05', DATE '2026-01-12', 'locked', now(), 1000, 0, 0, 0, 'week_calendar', $5)`,
        [settlementId, opco, `${tag}S`, driver, `${tag}-DOC`]);
      await db.query(
        `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, load_id, is_active)
         VALUES ($1::uuid, 'earnings', 'linehaul earnings', 1000.00, $2::uuid, true)`, [settlementId, load]);

      const out = await repointFuelReceiptsToLoad(db as never, { operatingCompanyId: opco, loadId: load, actorUserId: TEST_OWNER_USER_ID });
      expect(out.map((o) => [o.fill_id, o.outcome])).toEqual([[inWindow, "attached"]]);

      // SAME postings (ids + count), now on the load
      const after = await postings(inWindow);
      expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
      expect(after.every((p) => p.load_id === load)).toBe(true);
      expect(new Set(after.map((p) => p.je)).size).toBe(1);
      // SAME document, now on the load's spine, linked, lines without the reason, settlement named (#3)
      const docAfter = await one<{ id: string; load_id: string; expense_number: string; settlement_no: string | null }>(
        `SELECT id::text, load_id::text, expense_number, settlement_no FROM accounting.expenses WHERE source_fuel_transaction_id = $1::uuid AND voided_at IS NULL`, [inWindow]);
      expect(docAfter.id).toBe(docBefore.id);
      expect(docAfter.load_id).toBe(load);
      expect(docAfter.expense_number.startsWith(loadNumber)).toBe(true);
      expect(docAfter.settlement_no).toBe(`${tag}-DOC`);
      const lines = (await db.query<{ load_id: string | null; reason: string | null }>(
        `SELECT load_id::text, load_exemption_reason AS reason FROM accounting.expense_lines WHERE expense_id = $1::uuid`, [docAfter.id])).rows;
      expect(lines.every((l) => l.load_id === load && l.reason === null)).toBe(true);
      const link = await db.query(`SELECT 1 FROM expense_attribution.expense_load_links WHERE expense_id = $1::uuid AND load_id = $2::uuid`, [docAfter.id, load]);
      expect(link.rows.length).toBe(1);
      const ftAfter = await one<{ load_id: string | null; reason: string | null }>(`SELECT load_id::text, load_exemption_reason AS reason FROM fuel.fuel_transactions WHERE id = $1::uuid`, [inWindow]);
      expect(ftAfter).toEqual({ load_id: load, reason: null });
      const audit = await db.query(`SELECT 1 FROM audit.audit_events WHERE event_class = 'fuel.receipt_attached_to_load' AND payload->>'fill_id' = $1`, [inWindow]);
      expect(audit.rows.length).toBe(1);

      // the fill outside every window keeps its reason and no load
      expect((await postings(outside)).every((p) => p.load_id === null)).toBe(true);
      const ftOut = await one<{ load_id: string | null; reason: string | null }>(`SELECT load_id::text, load_exemption_reason AS reason FROM fuel.fuel_transactions WHERE id = $1::uuid`, [outside]);
      expect(ftOut.load_id).toBeNull();
      expect(ftOut.reason?.startsWith(FUEL_NO_LOAD_REASON_PREFIX)).toBe(true);

      // idempotent: nothing left to attach
      expect(await repointFuelReceiptsToLoad(db as never, { operatingCompanyId: opco, loadId: load, actorUserId: TEST_OWNER_USER_ID })).toEqual([]);
      // deferred refusals (expense line load-or-reason, balanced JE) hold at commit time
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");

      // the WORM trigger is unchanged: a posting's load is filled once, never moved
      await db.query("SAVEPOINT worm");
      await expect(db.query(`UPDATE accounting.journal_entry_postings SET load_id = NULL WHERE id = $1::uuid`, [after[0]!.id])).rejects.toThrow(/posting_fact_update_refused/);
      await db.query("ROLLBACK TO SAVEPOINT worm");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 90_000);
});
