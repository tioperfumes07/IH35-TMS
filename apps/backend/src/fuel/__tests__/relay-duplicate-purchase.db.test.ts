/**
 * 443.136 follow-up — real Postgres, one transaction rolled back, throwaway company:
 *  ACCT-F4431372: a Relay fill posted ON RECEIPT with no fuel row has ONE source document — the expense that adopted its
 *    entry. accounting.posting_source_load_id must resolve its postings to that document's load (old resolver: NULL, so
 *    verify-every-load-born-posting-carries-its-load reported every such posting).
 *  ACCT-F4431371: Relay listed ONE purchase under two transaction ids (same truck, place, products, volume, amount). The
 *    receipt identity keys on the transaction id, so the old poster booked it twice. The poster now refuses the second copy
 *    by name (relay_fill_duplicate_purchase); where both copies already posted, the Owner repair voids the later copy's
 *    document through the one expense void (reversal + receipt released + audit). Dry run writes nothing; idempotent.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postFuelFillOnReceipt } from "../../accounting/bank-recon/bank-match-fuel-post.service.js";
import { voidLaterRelayDuplicatePurchases } from "../relay-duplicate-purchase.service.js";
import { createJournalEntryOnClient } from "../../accounting/journal-entries.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("Relay receipt document load + one purchase posts once (443.136, real Postgres)", () => {
  it("resolves a fuel-row-less Relay posting to its document's load; refuses a duplicate copy; voids the later posted copy", async () => {
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
      const tag = `RDP${Date.now().toString(36).toUpperCase()}`;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [tag, `Relay duplicate purchase test ${tag}`])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const account = async (num: string, name: string, type: string, purpose: string | null = null) =>
        (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable, system_purpose)
                    VALUES ($1, $2, $3, $4, true, $5) RETURNING id::text AS id`, [opco, num, name, type, purpose])).id;
      const wallet = await account("1295", "Relay Fuel Wallet", "Asset", "relay_fuel_wallet");
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_wallet_relay', $2, true)`, [opco, wallet]);
      // The wallet holds money before it pays for fuel (an asset never goes negative — 202615330600).
      const equity = await account("3900", `${tag} Owner contribution`, "Equity");
      await createJournalEntryOnClient(db as never, {
        operating_company_id: opco, entry_date: "2026-09-01", memo: "wallet funded", source: "manual",
        postings: [
          { account_id: wallet, debit_or_credit: "debit", amount_cents: 100000 },
          { account_id: equity, debit_or_credit: "credit", amount_cents: 100000 },
        ],
      } as never, { userId: TEST_OWNER_USER_ID, role: "Owner" });
      const fuelAcct = await account("95000", `${tag} Fuel & Diesel`, "Expense");
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'Relay', 'other')`, [opco]);
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), 'EXPENSE_GL_POSTING_ENABLED', $1, NULL, true, $2, now())`, [opco, TEST_OWNER_USER_ID]);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}U`, `1RDP${tag.slice(-6)}`.padEnd(17, "0").slice(0, 17), opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Rdp', 'Driver', '5555550136') RETURNING id::text AS id`, [opco])).id;
      // The load the truck is running across the fills.
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid) RETURNING id::text AS id`,
        [opco, `${tag}L1`, customer, TEST_OWNER_USER_ID, trailerType, unit, driver])).id;
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
         VALUES ($1::uuid, 1, 'pickup', ('2026-09-06 08:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-09-06 09:00'::timestamp AT TIME ZONE '${TZ}')),
                ($1::uuid, 2, 'delivery', ('2026-09-09 15:00'::timestamp AT TIME ZONE '${TZ}'), ('2026-09-09 16:00'::timestamp AT TIME ZONE '${TZ}'))`,
        [load]);
      // A Relay fill: one diesel line, $171.04 paid, Laredo TX. No fuel row (posted on receipt).
      const relayFill = async (n: string, localAt: string, gallons = "31.204") => {
        const id = (await one(
          `INSERT INTO integrations.relay_fuel_transactions
             (operating_company_id, transaction_id, relay_created_at, total_amount_paid_cents, total_retail_price_cents, fees, raw_payload, ingest_source,
              matched_unit_id, location_id, location_city, location_state)
           VALUES ($1, $2, ($3::timestamp AT TIME ZONE '${TZ}'), 17104, 17800, '[]'::jsonb, '{}'::jsonb, 'daily_pull', $4, 'loc-laredo-1', 'Laredo', 'TX')
           RETURNING id::text AS id`,
          [opco, `${tag}-txn-${n}`, localAt, unit])).id;
        await db.query(
          `INSERT INTO integrations.relay_fuel_transaction_lines
             (operating_company_id, relay_fuel_transaction_id, line_index, fuel_type, volume, volume_uom, total_retail_price_cents, total_discounted_price_cents)
           VALUES ($1, $2, 0, 'diesel', $3::numeric, 'gallons', 17800, 17104)`,
          [opco, id, gallons]);
        return id;
      };
      const post = (fillId: string) =>
        postFuelFillOnReceipt(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "relay_fuel", fill_id: fillId });
      const livePostings = async (fillId: string) =>
        (await db.query<{ id: string; load_id: string | null; resolved: string | null; je: string }>(
          `SELECT p.id::text, p.load_id::text, p.journal_entry_uuid::text AS je,
                  accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id, p.reversal_of_line_id)::text AS resolved
             FROM accounting.journal_entry_postings p
            WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = $2
              AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL ORDER BY p.id`, [opco, fillId])).rows;

      // ---- ACCT-F4431372: posted on receipt, no fuel row; the resolver names the adopted document's load -------------------
      const first = await relayFill("A", "2026-09-07 10:00");
      expect((await post(first)).result).toBe("posted");
      const firstPostings = await livePostings(first);
      expect(firstPostings.length).toBeGreaterThan(0);
      expect(firstPostings.every((p) => p.load_id === load)).toBe(true);
      expect(firstPostings.every((p) => p.resolved === load)).toBe(true); // old resolver: NULL
      const noFuelRow = await one<{ n: string }>(`SELECT count(*)::text AS n FROM fuel.fuel_transactions WHERE relay_fuel_transaction_id = $1::uuid OR id = $1::uuid`, [first]);
      expect(noFuelRow.n).toBe("0");

      // ---- ACCT-F4431371 (engine): the same purchase listed again 86 min later is refused by name, nothing posts -------------
      const twin = await relayFill("B", "2026-09-07 11:26");
      await db.query("SAVEPOINT twin");
      await expect(post(twin)).rejects.toMatchObject({ code: "relay_fill_duplicate_purchase" }); // old code: posted a 2nd time
      await db.query("ROLLBACK TO SAVEPOINT twin");
      expect(await livePostings(twin)).toEqual([]);
      // A DIFFERENT purchase (other volume) on the same truck/place/amount still posts — the rule is exact, never fuzzy.
      const other = await relayFill("C", "2026-09-07 12:00", "31.205");
      expect((await post(other)).result).toBe("posted");

      // ---- ACCT-F4431371 (repair): both copies already posted (as the old poster left them) -> void the later copy -------------
      const old = await relayFill("D", "2026-09-09 12:00");
      const oldTwin = await relayFill("E", "2026-09-09 12:56");
      expect((await post(old)).result).toBe("posted");
      // The old poster had no duplicate rule: reproduce its state by posting the twin with the rule's function stubbed out.
      await db.query("SAVEPOINT oldpost");
      await db.query(`UPDATE integrations.relay_fuel_transactions SET location_id = 'loc-old-poster' WHERE id = $1::uuid`, [oldTwin]);
      expect((await post(oldTwin)).result).toBe("posted");
      await db.query(`UPDATE integrations.relay_fuel_transactions SET location_id = 'loc-laredo-1' WHERE id = $1::uuid`, [oldTwin]);
      await db.query("RELEASE SAVEPOINT oldpost");
      const twinDoc = await one<{ id: string }>(
        `SELECT e.id::text FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
            AND e.journal_entry_id = (SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p
                                       WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = $2 LIMIT 1)`, [opco, oldTwin]);

      const plan = await voidLaterRelayDuplicatePurchases(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: true });
      expect(plan.pairs).toBe(1);
      expect(plan.plans[0]).toMatchObject({ keep_fill_id: old, void_fill_id: oldTwin, void_expense_ids: [twinDoc.id], outcome: "planned" });
      expect((await livePostings(oldTwin)).length).toBeGreaterThan(0); // dry run wrote nothing

      const done = await voidLaterRelayDuplicatePurchases(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(done).toMatchObject({ pairs: 1, voided: 1, refused: 0 });
      expect(await livePostings(oldTwin)).toEqual([]); // reversed through the void engine
      // The voided document stays the source of the postings it bore: their load still resolves (void reverses, never rewrites).
      const bornOfVoided = (await db.query<{ load_id: string | null; resolved: string | null }>(
        `SELECT p.load_id::text, accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id, p.reversal_of_line_id)::text AS resolved
           FROM accounting.journal_entry_postings p
          WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = $2`, [opco, oldTwin])).rows;
      expect(bornOfVoided.length).toBeGreaterThan(0);
      expect(bornOfVoided.every((p) => p.load_id === load && p.resolved === load)).toBe(true);
      expect((await livePostings(old)).length).toBeGreaterThan(0); // the first copy stays
      const doc = await one<{ status: string; voided: boolean; rev: string | null }>(
        `SELECT status, voided_at IS NOT NULL AS voided, reversed_by_je_id::text AS rev FROM accounting.expenses WHERE id = $1::uuid`, [twinDoc.id]);
      expect(doc).toMatchObject({ status: "void", voided: true });
      expect(doc.rev).toBeTruthy();
      const receipt = await one<{ released: boolean }>(
        `SELECT bool_and(released_at IS NOT NULL) AS released FROM fuel.fuel_receipt_postings
          WHERE receipt_key = fuel.fuel_receipt_key($1::uuid, 'fuel_event', $2::text)`, [opco, oldTwin]);
      expect(receipt.released).toBe(true);
      const audit = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events WHERE event_class = 'expense.voided' AND payload->>'expense_id' = $1`, [twinDoc.id]);
      expect(audit.n).toBe("1");
      // The twin's postings net to zero; every posting of the company still resolves to its own load.
      const net = await one<{ net: string }>(
        `SELECT coalesce(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND source_transaction_id = $2`,
        [opco, oldTwin]);
      expect(net.net).toBe("0");
      // Idempotent: nothing left to void.
      expect((await voidLaterRelayDuplicatePurchases(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false })).pairs).toBe(0);
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 90_000);
});
