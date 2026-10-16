/**
 * LEAD 443.142 — real Postgres: the Dreamline provider statement is the source of truth for every Dreamline receipt.
 *   - a line whose purchase is already on the books (posted at the pump retail, paid from 2510) is ADOPTED: no second
 *     fuel posting; the card discount posts Dr 2510 / Cr "Fuel Card Discount" sourced to that receipt's expense;
 *   - a line not on the books is imported through the ONE poster: Dr fuel / Cr 2510 at what the card charged + document;
 *   - a line before the USMCA start date is Transportation's: nothing written;
 *   - a second run writes nothing.
 * On main there is no Dreamline statement path: the generic import never stamps the card rail, so for USMCA every row
 * resolves RELAY and stays unposted, and an existing receipt is imported again under a new key.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postFuelFillOnReceipt } from "../../accounting/bank-recon/bank-match-fuel-post.service.js";
import { importDreamlineStatement, type DreamlineStatementLine } from "../dreamline-statement-import.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Dreamline statement import (443.142, real Postgres)", () => {
  it("adopts the booked receipt + posts the card discount, imports the missing fill, skips pre-cutoff, re-run is a no-op", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "DLS", legalNamePrefix: "443.142 dreamline statement" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    // The read-backs below run between transactions; FORCED row-level security hides every row without the bypass.
    await db.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, false)", [opco]);
    const tag = `DLS${Date.now().toString(36).toUpperCase()}`;
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
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`, [opco, `${tag}L1`, customer, TEST_OWNER_USER_ID, trailerType])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`T${unitNo}`, `${tag}VIN00000000`.slice(0, 17), opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Dls', 'Driver', '5555550142') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'LOVES', 'other') RETURNING id::text AS id`, [opco])).id;
      const fuelAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '5000') RETURNING id::text AS id`, [opco, `${tag} Fuel & Diesel`])).id;
      const scaleAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '6150') RETURNING id::text AS id`, [opco, `${tag} Scale`])).id;
      const payable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '2510') RETURNING id::text AS id`, [opco, `${tag} Dreamline Diesel Card Payable`])).id;
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel Card Discount', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'OTR-Scale Expense', 'NonInventory', $2)`, [opco, scaleAcct]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_dreamline', $2, true)`, [opco, payable]);
      // LEAD 443.166 — the truck runs this load 08-10 .. 08-12 (actual stop stamps, company time): the 08-12 fills land on it
      // by the one fuel-to-load rule; a fill on 08-20 has no covering load and must be HELD (no live fuel row, no posting).
      await db.query(`UPDATE mdata.loads SET assigned_unit_id = $2::uuid, assigned_primary_driver_id = $3::uuid WHERE id = $1::uuid`, [load, unit, driver]);
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
         VALUES ($1::uuid, 1, 'pickup', ('2026-08-10 08:00'::timestamp AT TIME ZONE 'America/Chicago'), ('2026-08-10 09:00'::timestamp AT TIME ZONE 'America/Chicago')),
                ($1::uuid, 2, 'delivery', ('2026-08-12 17:00'::timestamp AT TIME ZONE 'America/Chicago'), ('2026-08-12 18:00'::timestamp AT TIME ZONE 'America/Chicago'))`,
        [load]
      );
      const card = (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, 'DREAMLINE', 'Dreamline', true) RETURNING id::text AS id`, [opco])).id;
      for (const flag of ["EXPENSE_GL_POSTING_ENABLED", "FUEL_POSTS_ON_RECEIPT_ENABLED"]) {
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
           VALUES (gen_random_uuid(), $1, $2, NULL, true, $3, now())`, [flag, opco, TEST_OWNER_USER_ID]);
      }
      // The receipt already on the books: pump retail $300.00, paid from 2510, posted with its document.
      const booked = (await one(
        `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, driver_id, unit_id, fuel_type, gallons, price_per_gallon,
           total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
         VALUES ($1, $2, $3, $4, $5, 'diesel', 60, 5, 300.00, '2026-08-10T17:00:00Z', '2026-08-10T17:00:00Z', '1911564', 'manual', $6, $7, 'TX')
         RETURNING id::text AS id`, [opco, vendor, load, driver, unit, `${tag}-booked`, card])).id;
      await postFuelFillOnReceipt(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: booked });
      await db.query("COMMIT");

      const line = (over: Partial<DreamlineStatementLine>): DreamlineStatementLine => ({
        line_number: 2, card_number: "7083050030797447047", transaction_at: "2026-08-10T17:05:00.000Z", local_date: "2026-08-10",
        efs_invoice: "84092", unit_label: unitNo, driver_name: "Dls Driver", location_name: "LOVES #762 TRAVEL STOP", city: "LAREDO",
        state: "TX", item: "ULSD", product: "diesel", quantity: 60, retail_ppu: 5, gross_cents: 30000, discount_cents: 2000, net_cents: 28000,
        fee_cents: 150, ...over,
      });
      const lines = [
        line({}),
        line({ line_number: 3, efs_invoice: "55708", transaction_at: "2026-08-12T14:00:00.000Z", local_date: "2026-08-12", gross_cents: 50000, discount_cents: 3000, net_cents: 47000 }),
        line({ line_number: 4, efs_invoice: "15304", transaction_at: "2026-08-01T14:00:00.000Z", local_date: "2026-08-01", gross_cents: 40000, discount_cents: 0, net_cents: 40000 }),
        // 443.142-FIX: a scale ticket not on the books -> one OTR-Scale line, POSTED Dr OTR-Scale / Cr 2510.
        line({ line_number: 5, efs_invoice: "66602", item: "SCLE", product: "scale", transaction_at: "2026-08-12T15:00:00.000Z", local_date: "2026-08-12", quantity: 1, gross_cents: 1525, discount_cents: 0, net_cents: 1525 }),
        // 443.166: no load covers the truck (or its driver) on 08-20 -> HELD, nothing written (TIER 1: a working truck's fill
        // carries its load). On the old engine this posted a live fuel row with load_id NULL (deadhead reason).
        line({ line_number: 6, efs_invoice: "65267", transaction_at: "2026-08-20T15:11:00.000Z", local_date: "2026-08-20", gross_cents: 56669, discount_cents: 0, net_cents: 56669 }),
      ];
      const payableNet = async () => Number((await one<{ n: string }>(
        `SELECT coalesce(sum(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::text AS n
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND account_id = $2::uuid`, [opco, payable])).n);
      const fuelPostings = async () => Number((await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event'`, [opco])).n);
      const tb = async () => Number((await one<{ n: string }>(
        `SELECT coalesce(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS n
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [opco])).n);
      expect(await payableNet()).toBe(30000);
      const fuelBefore = await fuelPostings();

      await begin();
      const first = await importDreamlineStatement(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, lines });
      await db.query("COMMIT");
      expect(first.by_outcome.adopted.lines).toBe(1);
      expect(first.by_outcome.imported.lines).toBe(1);
      expect(first.by_outcome.pre_cutoff.lines).toBe(1);
      expect(first.difference_posted_cents).toBe(2000);
      expect(first.by_outcome.scale_imported.lines).toBe(1);
      expect(first.by_outcome.held_no_load.lines).toBe(1);
      const heldRows = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_reference = '65267'`, [opco]);
      expect(heldRows.n).toBe("0");
      const loadless = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND load_id IS NULL`, [opco]);
      expect(loadless.n).toBe("0");
      const scale = await one<{ lines: string; posting_status: string; je: string | null; acct: string | null }>(
        `SELECT (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::text AS lines, e.posting_status, e.journal_entry_id::text AS je,
                (SELECT l.expense_account_uuid::text FROM accounting.expense_lines l WHERE l.expense_id = e.id LIMIT 1) AS acct
           FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.vendor_document_number = 'EFS-66602-SCLE'`, [opco]);
      expect(scale).toMatchObject({ lines: "1", posting_status: "posted", acct: scaleAcct });
      expect(scale.je).toBeTruthy();
      // 2510 = what the card charged for the USMCA fills: 280.00 + 470.00 + the 15.25 scale ticket. Nothing pre-cutoff.
      expect(await payableNet()).toBe(28000 + 47000 + 1525);
      expect(await tb()).toBe(0);
      // The adopted receipt kept its ONE fuel posting; the imported fill added exactly one fuel posting pair.
      const adoptedRow = first.results.find((r) => r.outcome === "adopted")!;
      const discountLegs = (await db.query<{ dc: string; cents: string; account_id: string }>(
        `SELECT debit_or_credit AS dc, amount_cents::text AS cents, account_id::text FROM accounting.journal_entry_postings
          WHERE operating_company_id = $1::uuid AND source_transaction_type = 'expense' AND source_transaction_id = $2 AND idempotency_key LIKE 'dreamline-statement:%'`,
        [opco, adoptedRow.expense_id])).rows;
      expect(discountLegs).toEqual(expect.arrayContaining([
        { dc: "debit", cents: "2000", account_id: payable },
        { dc: "credit", cents: "2000", account_id: fuelAcct },
      ]));
      const imported = first.results.find((r) => r.outcome === "imported")!;
      expect(imported.expense_id).toBeTruthy();
      const importedLoad = await one<{ load_id: string | null }>(
        `SELECT load_id::text FROM fuel.fuel_transactions WHERE id = $1::uuid`, [imported.fuel_transaction_id]);
      expect(importedLoad.load_id).toBe(load);
      const fuelAfter = await fuelPostings();
      expect(fuelAfter).toBeGreaterThan(fuelBefore);

      await begin();
      const second = await importDreamlineStatement(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, lines });
      await db.query("COMMIT");
      expect(second.by_outcome.already_imported.lines).toBe(3);
      expect(second.by_outcome.held_no_load.lines).toBe(1);
      expect(second.by_outcome.imported.lines + second.by_outcome.adopted.lines).toBe(0);
      expect(await payableNet()).toBe(28000 + 47000 + 1525);
      expect(await fuelPostings()).toBe(fuelAfter);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 300_000);
});
