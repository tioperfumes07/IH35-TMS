/**
 * LEAD 443.233 OWNER MILES RULE — real Postgres. A booked per-mile load with no AlwaysTrack L.Miles is priced from the lane's
 * recorded history (median), source written on the load and audited — not left awaiting. Main: awaiting_short_miles, $0.
 * Rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { ensureDriverBillArtifactsForLoad } from "../book-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("owner miles rule — lane history prices the bill (443.233, real Postgres)", () => {
  it("no L.Miles -> median of the lane's recorded short miles, source lane_history, bill priced", async () => {
    const fixtureLoadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const base = (await db.query<{ company: string; customer: string; trailer: string | null }>(
        `SELECT operating_company_id::text AS company, customer_id::text AS customer, load_trailer_equipment_id::text AS trailer
           FROM mdata.loads WHERE id = $1::uuid`, [fixtureLoadId])).rows[0]!;
      const co = base.company;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
      const tag = randomUUID().slice(0, 6);
      const city = `Lanetest${tag}`; // a lane no other fixture uses
      const driver = randomUUID();
      await db.query(`INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'Lane', 'Rule', $3)`,
        [driver, co, `+1006${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]);
      const load = async (n: string, short: number | null, withDriver: boolean) => {
        const id = (await db.query<{ id: string }>(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id,
                                    assigned_primary_driver_id, miles_shortest, miles_practical, driver_pay_rate_per_mile, driver_pay_rate_override_reason)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, 2000, 0.43, '443.233 per-load rate for the test') RETURNING id::text`,
          [co, `${n}-${tag}`, base.customer, TEST_OWNER_USER_ID, base.trailer, withDriver ? driver : null, short])).rows[0]!.id;
        await db.query(
          `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, city, state, scheduled_arrival_at)
           VALUES ($1::uuid, 1, 'pickup', 'Laredo', 'TX', '2026-10-01T12:00:00Z'), ($1::uuid, 2, 'delivery', $2, 'NJ', '2026-10-04T12:00:00Z')`,
          [id, city]);
        return id;
      };
      await load("H1", 1900, false);
      await load("H2", 1920, false);
      const target = await load("T", null, true);

      const out = await ensureDriverBillArtifactsForLoad(db as never, { loadId: target, operatingCompanyId: co, actorUserId: TEST_OWNER_USER_ID });
      expect(out.outcome, JSON.stringify(out)).toBe("minted"); // main: awaiting_short_miles
      const l = (await db.query<{ miles: string; src: string | null }>(
        `SELECT miles_shortest::text AS miles, miles_choice->'short'->>'source' AS src FROM mdata.loads WHERE id = $1::uuid`, [target])).rows[0]!;
      expect(Number(l.miles)).toBe(1910);
      expect(l.src).toBe("lane_history");
      const bill = (await db.query<{ status: string; gross: string; basis: string }>(
        `SELECT status, gross_amount_cents::text AS gross, miles_basis::text AS basis FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [target])).rows[0]!;
      expect(bill.status).toBe("open");
      expect(Number(bill.basis)).toBe(1910);
      expect(Number(bill.gross)).toBe(82130); // 1910 x $0.43
      const audit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'dispatch.load.short_miles_resolved' AND payload->>'load_id' = $1`, [target])).rows[0]!.n;
      expect(audit).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  }, 60_000);
});
