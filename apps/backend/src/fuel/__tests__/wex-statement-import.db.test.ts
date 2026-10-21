/**
 * LEAD 443.202 — real Postgres: the England Logistics WEX card statement through the ONE statement engine.
 *   - a line whose purchase a Settlement Creator settlement already carries (card WEX, receipt = the card charge, paid from
 *     2520) is ADOPTED — no second fuel row, no second posting — and named with its settlement;
 *   - a line not on the books is imported per ticket + product on card WEX at what WEX charged (gross + discount kept) and
 *     posts on receipt Dr fuel / Cr 2520 (never 2510), its driver taken from the truck's assignment (the file's typed
 *     name is not a driver);
 *   - a second run writes nothing (idempotent on the WEX invoice + item);
 *   - the Settlement Creator's shape rule then ADOPTS the received fill on its own load and refuses it anywhere else.
 * On main there is no WEX path: the generic import lands the rows with no card (USMCA reads Relay, nothing posts) and a
 * second copy of every settlement receipt.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postFuelFillOnReceipt } from "../../accounting/bank-recon/bank-match-fuel-post.service.js";
import { importWexStatement, type DreamlineStatementLine } from "../dreamline-statement-import.service.js";
import { findReceivedCardFillByShape } from "../../driver-finance/creator-received-fill-adoption.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("England WEX statement import (443.202, real Postgres)", () => {
  it("adopts the settlement receipt, imports the rest Cr 2520, re-run is a no-op, the Creator adopts by shape", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "WEX", legalNamePrefix: "443.202 wex statement" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    await db.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, false)", [opco]);
    const tag = `WEX${Date.now().toString(36).toUpperCase()}`;
    const unitNo = String(900000 + Math.floor(Math.random() * 99999));
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    const begin = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    };
    try {
      await begin();
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const newLoad = async (n: string) => (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`, [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType])).id;
      const load = await newLoad("L1");
      const otherLoad = await newLoad("L2");
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`T${unitNo}`, `${tag}VIN00000000`.slice(0, 17), opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Neftali', 'Wexdriver', '5555550202') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'LOVES', 'other') RETURNING id::text AS id`, [opco])).id;
      const fuelAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '5000') RETURNING id::text AS id`, [opco, `${tag} Fuel & Diesel`])).id;
      const defAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '5010') RETURNING id::text AS id`, [opco, `${tag} DEF`])).id;
      const scaleAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '6150') RETURNING id::text AS id`, [opco, `${tag} Scale`])).id;
      const wexPayable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '2520') RETURNING id::text AS id`, [opco, `${tag} England Logistics WEX Fuel Card Payable`])).id;
      const dreamlinePayable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '2510') RETURNING id::text AS id`, [opco, `${tag} Dreamline Diesel Card Payable`])).id;
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-DEF-Diesel Exhaust Fluid', 'NonInventory', $2)`, [opco, defAcct]);
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel Card Discount', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'OTR-Scale Expense', 'NonInventory', $2)`, [opco, scaleAcct]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_wex', $2, true)`, [opco, wexPayable]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_dreamline', $2, true)`, [opco, dreamlinePayable]);
      // The truck runs the load 10-10 .. 10-12 (actual stop stamps, company time), assigned to its driver.
      await db.query(`UPDATE mdata.loads SET assigned_unit_id = $2::uuid, assigned_primary_driver_id = $3::uuid WHERE id = $1::uuid`, [load, unit, driver]);
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
         VALUES ($1::uuid, 1, 'pickup', ('2026-10-10 08:00'::timestamp AT TIME ZONE 'America/Chicago'), ('2026-10-10 09:00'::timestamp AT TIME ZONE 'America/Chicago')),
                ($1::uuid, 2, 'delivery', ('2026-10-12 17:00'::timestamp AT TIME ZONE 'America/Chicago'), ('2026-10-12 18:00'::timestamp AT TIME ZONE 'America/Chicago'))`,
        [load]
      );
      const card = (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, 'WEX', 'England Logistics WEX Fuel Card', true) RETURNING id::text AS id`, [opco])).id;
      for (const flag of ["EXPENSE_GL_POSTING_ENABLED", "FUEL_POSTS_ON_RECEIPT_ENABLED"]) {
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
           VALUES (gen_random_uuid(), $1, $2, NULL, true, $3, now())`, [flag, opco, TEST_OWNER_USER_ID]);
      }
      // The Settlement Creator's receipt (settlement 5843 shape): station ticket 99010299, card WEX, receipt = WEX charge 180.33.
      const booked = (await one(
        `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, driver_id, unit_id, fuel_type, gallons, price_per_gallon,
           total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
         VALUES ($1, $2, $3, $4, $5, 'diesel', 30.622, 5.889, 180.33, '2026-10-10T17:00:00Z', '2026-10-10T17:00:00Z', '99010299', 'manual', $6, $7, 'TX')
         RETURNING id::text AS id`, [opco, vendor, load, driver, unit, `${tag}-booked`, card])).id;
      await postFuelFillOnReceipt(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: booked });
      await db.query(`UPDATE accounting.expenses SET source_settlement_ref = 'SETTLEMENT-5843' WHERE source_fuel_transaction_id = $1::uuid`, [booked]);
      await db.query("COMMIT");

      const line = (over: Partial<DreamlineStatementLine>): DreamlineStatementLine => ({
        line_number: 2, card_number: "501486*********0014", transaction_at: "2026-10-11T01:33:00.000Z", local_date: "2026-10-10",
        efs_invoice: "55714", unit_label: unitNo, driver_name: "Neftalia Coronado", location_name: "LOVES #762 TRAVEL STOP", city: "LAREDO",
        state: "TX", item: "ULSD", product: "diesel", quantity: 30.62, retail_ppu: 5.889, gross_cents: 18033, discount_cents: 0, net_cents: 18033,
        fee_cents: 0, ...over,
      });
      const lines = [
        line({}),
        // ticket 05661, 10-11: ULSD (WEX discount 39.38) + DEFD — not on any settlement yet
        line({ line_number: 3, efs_invoice: "05661", transaction_at: "2026-10-11T20:09:00.000Z", local_date: "2026-10-11", quantity: 87.01, gross_cents: 52982, discount_cents: 3938, net_cents: 49044 }),
        line({ line_number: 4, efs_invoice: "05661", item: "DEFD", product: "def", transaction_at: "2026-10-11T20:09:00.000Z", local_date: "2026-10-11", quantity: 4.03, retail_ppu: 4.889, gross_cents: 1969, discount_cents: 0, net_cents: 1969 }),
      ];
      const net = async (account: string) => Number((await one<{ n: string }>(
        `SELECT coalesce(sum(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::text AS n
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND account_id = $2::uuid`, [opco, account])).n);
      const tb = async () => Number((await one<{ n: string }>(
        `SELECT coalesce(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS n
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [opco])).n);
      const liveFuelRows = async () => Number((await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND voided_at IS NULL`, [opco])).n);
      expect(await net(wexPayable)).toBe(18033);

      // dry run: the plan, nothing written
      await begin();
      const plan = await importWexStatement(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, lines, dry_run: true });
      await db.query("COMMIT");
      expect(plan.by_outcome.adopted.lines).toBe(1);
      expect(plan.by_outcome.imported.lines).toBe(2);
      expect(await liveFuelRows()).toBe(1);

      await begin();
      const first = await importWexStatement(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, lines });
      await db.query("COMMIT");
      expect(first.by_outcome.adopted.lines).toBe(1);
      expect(first.results.find((r) => r.outcome === "adopted")).toMatchObject({ efs_invoice: "55714", settlement_no: "SETTLEMENT-5843", difference_cents: 0 });
      expect(first.by_outcome.imported.lines).toBe(2);
      expect(first.difference_posted_cents).toBe(0);
      expect(await liveFuelRows()).toBe(3);
      // 2520 = every WEX charge; 2510 untouched; balanced
      expect(await net(wexPayable)).toBe(18033 + 49044 + 1969);
      expect(await net(dreamlinePayable)).toBe(0);
      expect(await tb()).toBe(0);
      const importedRows = (await db.query(
        `SELECT transaction_reference AS ref, fuel_type::text AS fuel_type, fuel_card_id::text AS card,
                round(total_cost * 100)::int AS total, round(gross_cost * 100)::int AS gross, round(discount_amount * 100)::int AS disc,
                load_id::text AS load_id, driver_id::text AS driver_id
           FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND source = 'import' ORDER BY fuel_type`, [opco])).rows;
      expect(importedRows).toEqual([
        { ref: "05661", fuel_type: "def", card, total: 1969, gross: 1969, disc: 0, load_id: load, driver_id: driver },
        { ref: "05661", fuel_type: "diesel", card, total: 49044, gross: 52982, disc: 3938, load_id: load, driver_id: driver },
      ]);

      // re-run: nothing written
      await begin();
      const second = await importWexStatement(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, lines });
      await db.query("COMMIT");
      expect(second.by_outcome.already_imported.lines).toBe(3);
      expect(second.by_outcome.imported.lines + second.by_outcome.adopted.lines).toBe(0);
      expect(await liveFuelRows()).toBe(3);
      expect(await net(wexPayable)).toBe(18033 + 49044 + 1969);

      // The Creator's later settlement line for ticket 05661 prints the STATION receipt number and the pump retail: the
      // received fill is found by its shape and adopted on its own load; on another load it is refused by name.
      const shape = { operatingCompanyId: opco, card: "wex", fuelType: "diesel", unitId: unit, date: "2026-10-11", amountCents: 52982, gallons: 87.013 };
      const onLoad = await findReceivedCardFillByShape(db as never, { ...shape, loadId: load });
      expect(onLoad.adopt).toBeTruthy();
      expect(onLoad.blocking).toBeNull();
      const charged = await findReceivedCardFillByShape(db as never, { ...shape, loadId: load, amountCents: 49044 });
      expect(charged.adopt).toBe(onLoad.adopt);
      const elsewhere = await findReceivedCardFillByShape(db as never, { ...shape, loadId: otherLoad, unitId: null });
      expect(elsewhere.adopt).toBeNull();
      expect(elsewhere.blocking?.id).toBe(onLoad.adopt);
      // once a settlement carries it, it is never adopted again
      await db.query(`UPDATE accounting.expenses SET source_settlement_ref = 'SETTLEMENT-5850' WHERE source_fuel_transaction_id = $1::uuid`, [onLoad.adopt]);
      const settled = await findReceivedCardFillByShape(db as never, { ...shape, loadId: load });
      expect(settled.adopt).toBeNull();
      expect(settled.blocking?.reason).toMatch(/settlement/);
      // the Creator's own hand-entered receipt (source manual) is never a received fill
      const manual = await findReceivedCardFillByShape(db as never, { ...shape, amountCents: 18033, gallons: 30.622, date: "2026-10-10", loadId: load });
      expect(manual).toEqual({ adopt: null, blocking: null });
      const otherCard = await findReceivedCardFillByShape(db as never, { ...shape, card: "dreamline", loadId: load });
      expect(otherCard).toEqual({ adopt: null, blocking: null });
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 300_000);
});
