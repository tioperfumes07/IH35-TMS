/**
 * ACCT-F11141 — real Postgres (CI, migrated fresh DB): the post-as-signed supersede step on an OPEN P-trip.
 *   - a trip holding a signed load AND a load the document does not pay is TRIMMED: the signed load's lines voided, its open
 *     bill released (settled_in_settlement_id NULL), the load unlinked, the header recomputed from what stays;
 *   - a trip holding only signed loads is VOIDED through reverseSettlementForVoid (status cancelled, lines voided);
 *   - the signed loads end on NO live settlement (0 loads on two live settlements once the Creator posts them).
 * One transaction, rolled back. Old code: no supersede step — the trip kept the signed load's earnings (paid twice).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { supersedeForSignedSettlement } from "../settlement-creator-post-as-signed.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("post-as-signed supersede (ACCT-F11141, real Postgres)", () => {
  it("trims a mixed open trip, voids an all-signed one, and leaves each signed load on no live settlement", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const id = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(`${sql} RETURNING id::text`, params)).rows[0]!.id;
      const tag = `PAS${Date.now().toString(36).toUpperCase()}`;
      const co = await id("INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'Post-as-signed fixture', 'operating_carrier')", [tag]);
      await db.query("SELECT set_config('app.operating_company_id', $1, true), set_config('app.current_user_id', $2, true)", [co, TEST_OWNER_USER_ID]);
      const trailerType = await prepareCompanyForLoadInserts(db, co);
      const customer = await id("INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'PAS customer')", [co]);
      const driver = async (n: string) => id("INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, $2, 'Signed', '5555550188')", [co, `${tag}${n}`]);
      const load = async (n: string, drv: string) => {
        const num = `8${String(Date.now()).slice(-7)}${n}`;
        const lid = await id("INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_primary_driver_id) VALUES ($1, $2, $3, $4, $5, $6::uuid)",
          [co, num, customer, TEST_OWNER_USER_ID, trailerType, drv]);
        return { id: lid, num };
      };
      const trip = (display: string, drv: string) => id(
        "INSERT INTO driver_finance.driver_settlements (operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model) VALUES ($1, $2, $3, CURRENT_DATE-7, CURRENT_DATE, 'open', 0, 0, 0, 0, 'load_bookended')",
        [co, display, drv]);
      const earn = async (sid: string, l: { id: string; num: string }, drv: string, cents: number) => {
        const bill = await id("INSERT INTO driver_finance.driver_bills (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id) VALUES ($1, $2, $3, $3, $4, $5, 'open', $6)",
          [co, l.id, l.num, drv, cents, sid]);
        await db.query("INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount, load_id, source_driver_bill_id, is_active, is_sample_data) VALUES ($1, $2, 'earnings', $3, $4, $5, $6, true, false)",
          [sid, co, `Load ${l.num}`, cents / 100, l.id, bill]);
        await db.query("UPDATE mdata.loads SET presettlement_link_id = $1 WHERE id = $2", [sid, l.id]);
        return bill;
      };

      const dA = await driver("A");
      const signedA = await load("1", dA);
      const keptA = await load("2", dA);
      const tripA = await trip(`P-${tag}A`, dA);
      const billSigned = await earn(tripA, signedA, dA, 97945);
      await earn(tripA, keptA, dA, 40572);

      const dB = await driver("B");
      const signedB = await load("3", dB);
      const tripB = await trip(`P-${tag}B`, dB);
      await earn(tripB, signedB, dB, 87365);

      const draft = (drv: string, loads: Array<{ num: string }>) => ({
        operating_company_id: co, settlement_no: "999001", driver_id: drv, unit_id: null, period_start: "2026-10-20", period_end: "2026-10-26",
        loads: loads.map((l) => ({ load_number: l.num, factoring: "direct" })), fuel_purchases: [], expenses: [], deductions: [], reimbursements: [],
        escrow: [], advances: [], pdf_driver_net_cents: 0, pdf_company_expenses_cents: 0,
      }) as never;

      const a = await supersedeForSignedSettlement(db as never, TEST_OWNER_USER_ID, co, draft(dA, [signedA]));
      expect(a.trimmed_trips.map((t) => t.settlement_id)).toEqual([tripA]);
      expect(a.voided_trips).toEqual([]);
      const linesA = (await db.query<{ load_id: string; live: boolean }>(
        "SELECT load_id::text, (voided_at IS NULL AND is_active) AS live FROM driver_finance.settlement_lines WHERE settlement_id = $1", [tripA])).rows;
      expect(linesA.find((l) => l.load_id === signedA.id)?.live).toBe(false);
      expect(linesA.find((l) => l.load_id === keptA.id)?.live).toBe(true);
      const headA = (await db.query<{ status: string; gross_pay: string }>("SELECT status, gross_pay::text FROM driver_finance.driver_settlements WHERE id = $1", [tripA])).rows[0]!;
      expect(headA).toMatchObject({ status: "open", gross_pay: "405.72" });
      expect((await db.query("SELECT settled_in_settlement_id FROM driver_finance.driver_bills WHERE id = $1", [billSigned])).rows[0]!.settled_in_settlement_id).toBeNull();
      expect((await db.query("SELECT presettlement_link_id FROM mdata.loads WHERE id = $1", [signedA.id])).rows[0]!.presettlement_link_id).toBeNull();

      const b = await supersedeForSignedSettlement(db as never, TEST_OWNER_USER_ID, co, draft(dB, [signedB]));
      expect(b.voided_trips.map((t) => t.settlement_id)).toEqual([tripB]);
      const headB = (await db.query<{ status: string; voided: boolean }>("SELECT status, voided_at IS NOT NULL AS voided FROM driver_finance.driver_settlements WHERE id = $1", [tripB])).rows[0]!;
      expect(headB).toMatchObject({ status: "cancelled", voided: true });

      // Neither signed load is on a live settlement any more; the kept load still is.
      const live = async (loadId: string) => Number((await db.query<{ n: string }>(
        `SELECT count(DISTINCT s.id)::text AS n FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
          WHERE sl.load_id = $1 AND sl.voided_at IS NULL AND sl.is_active AND s.voided_at IS NULL AND s.status <> 'cancelled'`, [loadId])).rows[0]!.n);
      expect(await live(signedA.id)).toBe(0);
      expect(await live(signedB.id)).toBe(0);
      expect(await live(keptA.id)).toBe(1);

      // Idempotent: a second supersede of the same document finds nothing left to supersede.
      const again = await supersedeForSignedSettlement(db as never, TEST_OWNER_USER_ID, co, draft(dA, [signedA]));
      expect([again.trimmed_trips.length, again.voided_trips.length, again.reversed_settlements.length]).toEqual([0, 0, 0]);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
