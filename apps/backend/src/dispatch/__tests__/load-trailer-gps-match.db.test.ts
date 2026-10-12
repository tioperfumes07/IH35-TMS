/**
 * LEAD 443.107 item 2 — real Postgres: matchLoadTrailersByGps records a load's physical trailer from GPS co-location
 * (Samsara trailer history is injected; the truck track is real telematics.vehicle_locations rows). Every fixture lives
 * in ONE transaction that is rolled back — nothing is left behind.
 *
 *  - one trailer riding with the truck pickup -> delivery: matched; assignment row + expense + expense line stamped;
 *    one audit event; amounts identical;
 *  - two trailers both riding along: "two_candidates", nothing written;
 *  - no trailer GPS at all: "no_trailer_gps"; a trailer parked far away: "no_co_located_trailer";
 *  - a customer-trailer load is never considered; another company's trailer is never a candidate;
 *  - expenses already naming a different trailer: "conflict", nothing written;
 *  - dry run writes nothing; a second run skips the matched load (it now has an assignment trailer).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import type { TrailerGpsFix } from "../../integrations/samsara/samsara-client.js";
import { CO_LOCATED_METERS, matchLoadTrailersByGps, scoreCandidate } from "../load-trailer-gps-match.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const START = Date.parse("2026-09-01T12:00:00Z");
const MIN = 60_000;
/** A straight 4-hour drive north: one fix every 10 minutes. */
const track = (offsetLat = 0, offsetLng = 0): TrailerGpsFix[] =>
  Array.from({ length: 25 }, (_, i) => ({ t: START + i * 10 * MIN, lat: 29.4 + i * 0.02 + offsetLat, lng: -98.5 + offsetLng }));

describe("GPS co-location scoring (pure)", () => {
  it("a trailer on the truck matches; one 1 km off does not; thin data does not", () => {
    const truck = track();
    expect(scoreCandidate(truck, track(0.0005), START, START + 240 * MIN).matches).toBe(true); // ~55 m
    expect(scoreCandidate(truck, track(0.01), START, START + 240 * MIN).matches).toBe(false); // ~1.1 km
    expect(scoreCandidate(truck, track().slice(0, 3), START, START + 240 * MIN).matches).toBe(false);
    // present for the drive but not at delivery -> no match
    expect(scoreCandidate(truck, track().slice(0, 15), START, START + 240 * MIN).matches).toBe(false);
    expect(CO_LOCATED_METERS).toBe(300);
  });
});

describeIntegration("load trailer decided by Samsara GPS (443.107, real Postgres)", () => {
  it("match / two candidates / no GPS / parked / customer / foreign / conflict / dry run / idempotent", async () => {
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
      const tag = `TGP${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `GPS trailer test ${code}`]
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'TGP customer') RETURNING id::text AS id`, [opco])).id;
      const unit = async (n: string) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
          [`${tag}-${n}`, `VIN${tag}${n}`.slice(0, 17), opco])).id;
      const equipment = async (n: string, owner: string, samsara: string) =>
        (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id, samsara_vehicle_id) VALUES ($1, 'Reefer', $2, $3) RETURNING id::text AS id`,
          [`${tag}-${n}`, owner, samsara])).id;
      const tRide = await equipment("T1", opco, `${tag}S1`);
      const tTwin = await equipment("T2", opco, `${tag}S2`);
      const tParked = await equipment("T3", opco, `${tag}S3`);
      await equipment("T4", other, `${tag}S4`); // another company's trailer — never a candidate
      const nonOwned = (await one(
        `INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id) VALUES ($1, $2, 'customer', $3) RETURNING id::text AS id`,
        [opco, `${tag}-C1`, customer]
      )).id;
      let ev = 0;
      const load = async (n: string, unitId: string) => {
        const id = (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unitId]
        )).id;
        await db.query(`INSERT INTO mdata.load_stops (operating_company_id, load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
                        VALUES ($1, $2, 1, 'pickup', $3, $3), ($1, $2, 2, 'delivery', $4, $4)`,
          [opco, id, new Date(START).toISOString(), new Date(START + 240 * 60_000).toISOString()]);
        for (const f of track()) {
          await db.query(`INSERT INTO telematics.vehicle_locations (operating_company_id, unit_id, samsara_vehicle_id, captured_at, lat, lng, raw_samsara_event_id)
                          VALUES ($1, $2, 'veh', $3, $4, $5, $6)`, [opco, unitId, new Date(f.t).toISOString(), f.lat, f.lng, `${tag}-ev-${(ev += 1)}`]);
        }
        return id;
      };
      let trace = 100_000 + (Date.now() % 800_000); // trace_key = lpad(trace_no, 6) truncates — stay at 6 digits
      const expense = async (loadId: string, trailerId: string | null) =>
        (await one(`INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id, trailer_id)
                    VALUES ($1, current_date, 500, $2, $3, $4) RETURNING id::text AS id`, [opco, (trace += 1), loadId, trailerId])).id;

      const lMatch = await load("1", await unit("U1"));
      const xMatch = await expense(lMatch, null);
      const lTwo = await load("2", await unit("U2"));
      const lNoGps = await load("3", await unit("U3"));
      const lParked = await load("4", await unit("U4"));
      const lConflict = await load("5", await unit("U5"));
      await expense(lConflict, tParked);
      const lCustomer = await load("6", await unit("U6"));
      await db.query(`UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $2 WHERE id = $1`, [lCustomer, nonOwned]);

      // Samsara (injected): S1 rides with every truck; S2 rides only on load 2's window too (same window for all loads, so
      // per-load behaviour is driven by which ids the fetcher returns per call — keyed by the load being scored).
      let call = 0;
      const order = [lMatch, lTwo, lNoGps, lParked, lConflict];
      const fetchTrailerGps = async () => {
        const l = order[call++];
        const m = new Map<string, TrailerGpsFix[]>();
        if (l === lMatch || l === lConflict) m.set(`${tag}S1`, track(0.0005));
        if (l === lTwo) { m.set(`${tag}S1`, track(0.0005)); m.set(`${tag}S2`, track(-0.0005)); }
        if (l === lParked) m.set(`${tag}S3`, track(0.05));
        if (l !== lNoGps) m.set(`${tag}S4`, track(0.0001)); // foreign trailer right on the truck: must be ignored
        return m;
      };
      const loadIds = order; // excludes nothing — the customer load is filtered by the service itself
      const amounts = async () => (await db.query(`SELECT id, total_amount_cents, status FROM accounting.expenses WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows;
      const before = await amounts();

      // Dry run: decisions, nothing written.
      const dry = await matchLoadTrailersByGps(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: true, loadIds: [...loadIds, lCustomer], fetchTrailerGps });
      expect(dry.loads_considered).toBe(5); // customer load never considered
      const byLoad = (r: typeof dry) => Object.fromEntries(r.loads.map((d) => [d.load_id, d]));
      const dd = byLoad(dry);
      expect(dd[lMatch]).toMatchObject({ decision: "match", trailer_id: tRide, outcome: "planned" });
      expect(dd[lTwo]).toMatchObject({ decision: "two_candidates", trailer_id: null });
      expect(dd[lTwo].reason).toMatch(/two candidates/);
      expect(dd[lNoGps]).toMatchObject({ decision: "no_trailer_gps" });
      expect(dd[lParked]).toMatchObject({ decision: "no_co_located_trailer" });
      expect(dd[lConflict]).toMatchObject({ decision: "conflict", trailer_id: tRide });
      expect(dry.loads.some((d) => d.candidates.some((c) => c.trailer_number?.endsWith("-T4")))).toBe(false);
      const hist = async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM dispatch.load_assignment_history WHERE operating_company_id = $1 AND new_trailer_id IS NOT NULL`, [opco])).rows[0]!.n;
      expect(await hist()).toBe(0);

      // Real run.
      call = 0;
      const run = await matchLoadTrailersByGps(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false, loadIds, fetchTrailerGps });
      expect(run.stamped_loads).toBe(1);
      expect(run.refused_loads).toBe(0);
      expect(byLoad(run)[lMatch]).toMatchObject({ outcome: "stamped", expenses_stamped: 1 });
      expect(await hist()).toBe(1);
      const h = (await db.query(`SELECT load_id::text, new_trailer_id::text, assignment_method, reason_code FROM dispatch.load_assignment_history WHERE operating_company_id = $1 AND new_trailer_id IS NOT NULL`, [opco])).rows[0];
      expect(h).toEqual({ load_id: lMatch, new_trailer_id: tRide, assignment_method: "auto_reassign", reason_code: "gps_trailer_match" });
      expect((await db.query(`SELECT trailer_id::text AS t FROM accounting.expenses WHERE id = $1`, [xMatch])).rows[0].t).toBe(tRide);
      const audit = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'load.trailer_matched_by_gps' AND payload->>'operating_company_id' = $1`, [opco])).rows[0]!.n;
      expect(audit).toBe(1);
      expect(await amounts()).toEqual(before);

      // Idempotent: the matched load now has an assignment trailer and is not considered again.
      call = 1;
      const again = await matchLoadTrailersByGps(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false, loadIds: order.slice(1), fetchTrailerGps });
      expect(again.stamped_loads).toBe(0);
      expect(again.loads.find((d) => d.load_id === lMatch)).toBeUndefined();
      expect(await hist()).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
