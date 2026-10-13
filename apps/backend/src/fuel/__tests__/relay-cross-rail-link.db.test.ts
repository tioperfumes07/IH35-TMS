/**
 * LEAD 443.133 A — real Postgres: a Relay fill links ONLY to a settlement fuel row paid by the RELAY card.
 * On 2026-10-12 18:36 the Relay backfill linked 4 DREAMLINE-paid rows (already posted Dr fuel / Cr 2510 at retail) to 2 Relay
 * fills because the pairing rule ignored the rail; the link also relabelled diesel -> reefer_diesel and stamped a trailer.
 * Old code: the DREAMLINE row links (this test fails), crossRailFuelRowsForRelayFill / undoCrossRailRelayLinks do not exist.
 *
 * Everything runs in ONE rolled-back transaction under a throwaway company.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { crossRailFuelRowsForRelayFill, linkRelayFillToSettlementFuelRows } from "../relay-fill-link.service.js";
import { undoCrossRailRelayLinks } from "../relay-cross-rail-undo.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Relay fill links only Relay-card rows; cross-rail links are undone (443.133 A, real Postgres)", () => {
  it("a DREAMLINE row is a cross-rail candidate, never linked; an old wrong link is undone to its pre-link values", async () => {
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
      const tag = `XRL${Date.now().toString(36).toUpperCase()}`;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [tag, `Cross-rail test ${tag}`])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}U`, `${tag}VIN00000000`.slice(0, 17), opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`,
        [opco, `${tag} fuel vendor`])).id;
      const card = async (code: string) =>
        (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, $2, $2, true) RETURNING id::text AS id`, [opco, code])).id;
      const relayCard = await card("RELAY");
      const dreamCard = await card("DREAMLINE");
      const at = "2026-10-08T10:00:00Z";
      const fillRow = async (cardId: string, n: string) =>
        (await one(
          `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, load_required, unit_id, fuel_type, gallons, price_per_gallon,
             total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
           VALUES ($1, $2, NULL, false, $3, 'diesel', 100.000, 5.69, 569.00, $4::timestamptz, $4::timestamptz, $5, 'manual', $6, $7, 'TX') RETURNING id::text AS id`,
          [opco, vendor, unit, at, `${tag}${n}`, `${tag}-row-${n}`, cardId])).id;
      const relayFill = async (n: string) => {
        const id = (await one(
          `INSERT INTO integrations.relay_fuel_transactions
             (operating_company_id, transaction_id, relay_created_at, total_amount_paid_cents, total_retail_price_cents, fees, raw_payload, ingest_source, matched_unit_id)
           VALUES ($1, $2, $3::timestamptz, 52000, 56900, '[]'::jsonb, '{}'::jsonb, 'daily_pull', $4) RETURNING id::text AS id`,
          [opco, `${tag}-txn-${n}`, at, unit])).id;
        await db.query(
          `INSERT INTO integrations.relay_fuel_transaction_lines
             (operating_company_id, relay_fuel_transaction_id, line_index, fuel_type, volume, volume_uom, total_retail_price_cents, total_discounted_price_cents)
           VALUES ($1, $2, 0, 'diesel', 100.000, 'gallons', 56900, 52000)`,
          [opco, id]);
        return id;
      };

      // 1) A DREAMLINE-paid row that pairs with a Relay fill (same truck, day, product, gallons) is NOT linked — a candidate.
      const dream = await fillRow(dreamCard, "D");
      const fillA = await relayFill("A");
      await linkRelayFillToSettlementFuelRows(db as never, opco, fillA);
      const linkedDream = await one<{ r: string | null }>(`SELECT relay_fuel_transaction_id::text AS r FROM fuel.fuel_transactions WHERE id = $1`, [dream]);
      expect(linkedDream.r).toBeNull(); // old code: linked to fillA
      expect((await crossRailFuelRowsForRelayFill(db as never, opco, fillA)).map((r) => [r.fuel_transaction_id, r.card])).toEqual([[dream, "DREAMLINE"]]);

      // 2) A RELAY-card row still links exactly as before.
      const relayRow = await fillRow(relayCard, "R");
      const fillB = await relayFill("B");
      await db.query(`UPDATE fuel.fuel_transactions SET transaction_at = transaction_at + interval '3 days' WHERE id = $1`, [dream]); // out of fillB's day window
      const out = await linkRelayFillToSettlementFuelRows(db as never, opco, fillB);
      expect(out).toContainEqual({ linked: relayRow, candidates: 1 });

      // 3) An OLD wrong link (what the pre-443.133 linker wrote: link + diesel -> reefer_diesel) is undone to its pre-link values.
      await db.query(`UPDATE fuel.fuel_transactions SET transaction_at = $2::timestamptz WHERE id = $1`, [dream, at]);
      await db.query(`UPDATE fuel.fuel_transactions SET relay_fuel_transaction_id = $2::uuid, fuel_type = 'reefer_diesel' WHERE id = $1`, [dream, fillA]);
      const plan = await undoCrossRailRelayLinks(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: true });
      expect(plan.considered).toBe(1);
      expect(plan.rows[0]).toMatchObject({ fuel_transaction_id: dream, outcome: "planned", restore: { relay_fuel_transaction_id: null, fuel_type: "diesel" } });
      const still = await one<{ r: string | null }>(`SELECT relay_fuel_transaction_id::text AS r FROM fuel.fuel_transactions WHERE id = $1`, [dream]);
      expect(still.r).toBe(fillA); // dry run wrote nothing
      const done = await undoCrossRailRelayLinks(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(done.undone).toBe(1);
      const after = await one<{ r: string | null; t: string; c: string }>(
        `SELECT relay_fuel_transaction_id::text AS r, fuel_type::text AS t, total_cost::text AS c FROM fuel.fuel_transactions WHERE id = $1`, [dream]);
      expect(after).toEqual({ r: null, t: "diesel", c: "569.00" }); // money untouched
      const audits = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events WHERE event_class = 'fuel.relay_cross_rail_link_undone' AND payload->>'fuel_transaction_id' = $1`, [dream]);
      expect(audits.n).toBe("1");
      // Idempotent: nothing left to undo.
      expect((await undoCrossRailRelayLinks(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false })).considered).toBe(0);
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
});
