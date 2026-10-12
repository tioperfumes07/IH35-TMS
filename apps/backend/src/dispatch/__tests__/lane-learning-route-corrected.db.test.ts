/**
 * LEAD 443.124 — a load whose origin / destination is corrected after booking (443.74 / 443.86 / 443.90 GPS stop
 * verification) learns the corrected route's lane through the ONE lane engine. Prod: 13511 / 13536 / 13573 / 13660 learned the
 * booked route at booking, were moved by the GPS correction, and the corrected route never got a lane (verify-booked-loads-save-
 * miles RULE 3). Real Postgres, every case inside a transaction rolled back by the test.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { learnLoadLanes } from "../load-lane-learning.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("443.124 — a GPS-corrected route learns its lane (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suf = randomUUID().slice(0, 6).toUpperCase();

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
  }, 30_000);
  afterAll(async () => {
    await db?.end();
  });

  /** Book a load on WARSAW-x NC -> LAREDO-x TX, learn its lane as Book Load does, then correct its pickup like 443.74. */
  async function bookedThenCorrected() {
    const equipmentId = await prepareCompanyForLoadInserts(db, companyId);
    const loadId = randomUUID();
    const customerId = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id::text AS id`,
      [`443.124 customer ${suf}`, companyId]
    )).rows[0]!.id;
    await db.query(
      `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, miles_practical, loaded_miles, dispatcher_user_id, load_trailer_equipment_id)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'delivered_pending_docs', 1633.5, 1523.5, $5::uuid, $6::uuid)`,
      [loadId, companyId, String(900000 + Math.floor(Math.random() * 90000)), customerId, TEST_OWNER_USER_ID, equipmentId]
    );
    const pickup = randomUUID();
    await db.query(
      `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type, city, state, postal_code, scheduled_arrival_at)
       VALUES ($1::uuid, $2::uuid, 1, 'pickup', $3, 'NC', '28398', now() - interval '7 days'),
              (gen_random_uuid(), $2::uuid, 2, 'delivery', $4, 'TX', '78045', now() - interval '5 days')`,
      [pickup, loadId, `WARSAW${suf}`, `LAREDO${suf}`]
    );
    await learnLoadLanes(db, { operatingCompanyId: companyId, loadId, fresh: true, actorUserId: TEST_OWNER_USER_ID });
    // 443.74 applied: the truck loaded 96 km away — the pickup is now the GPS-verified facility.
    await db.query(`UPDATE mdata.load_stops SET city = $2, state = 'NC', postal_code = '28358' WHERE id = $1::uuid`, [pickup, `LUMBERTON${suf}`]);
    return loadId;
  }
  const laneRows = async (originCity: string) =>
    (await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM catalogs.lane_mileage
        WHERE operating_company_id = $1::uuid AND upper(origin_city) = upper($2) AND upper(dest_city) = upper($3) AND updated_at >= now() - interval '1 minute'`,
      [companyId, originCity, `LAREDO${suf}`]
    )).rows[0]!.n;

  it("old behaviour: a re-learn after the correction counts nothing — the corrected route has no lane (the prod defect)", async () => {
    await db.query("BEGIN");
    try {
      const loadId = await bookedThenCorrected();
      expect(await laneRows(`WARSAW${suf}`)).toBe(1);
      const r = await learnLoadLanes(db, { operatingCompanyId: companyId, loadId, fresh: false, actorUserId: TEST_OWNER_USER_ID });
      expect(r.lane_skip_reason).toBe("already_learned");
      expect(await laneRows(`LUMBERTON${suf}`)).toBe(0);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("routeCorrected: the corrected route's lane is written once, through the one engine", async () => {
    await db.query("BEGIN");
    try {
      const loadId = await bookedThenCorrected();
      const r = await learnLoadLanes(db, { operatingCompanyId: companyId, loadId, fresh: false, routeCorrected: true, actorUserId: TEST_OWNER_USER_ID });
      expect(r.lane).toBe("city_row_created");
      expect(await laneRows(`LUMBERTON${suf}`)).toBe(1);
      const lane = (await db.query<{ practical: string; n: number }>(
        `SELECT practical_miles::text AS practical, n_practical AS n FROM catalogs.lane_mileage
          WHERE operating_company_id = $1::uuid AND upper(origin_city) = upper($2) AND upper(dest_city) = upper($3)`,
        [companyId, `LUMBERTON${suf}`, `LAREDO${suf}`]
      )).rows[0]!;
      expect(Number(lane.practical)).toBe(1633.5);
      expect(lane.n).toBe(1);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
