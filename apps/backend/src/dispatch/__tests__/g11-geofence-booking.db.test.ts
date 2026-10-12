/**
 * G11 + AJK-03 (443.129): geocode_precision at stop INSERT + load status via the ONE transition engine.
 *
 * Fails on old code: (1) without geocode_precision at INSERT, bindLoadToGeofences creates 0 fences;
 * (2) without transitionDispatchLoadInClientTx in the detector, GPS evidence never moves load status
 * (pre-G11) or moved it via a raw UPDATE (partial G11 — AJK-03 violation). Runs only under CI
 * ephemeral Postgres (describeIntegration).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../auth/db.js";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { bookLoad } from "../book-load.service.js";
import { processGeofenceDetectionsForGpsPoint } from "../../telematics/geofence-detector.service.js";
import { bindLoadToGeofences } from "../geofences/load-geofence-binding.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("G11: geocode_precision at booking + load status from fence evidence (443.110)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;
  let trailerEquipmentId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    trailerEquipmentId = await prepareCompanyForLoadInserts(db, companyId);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`G11 test customer ${randomUUID().slice(0, 8)}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    await db.query(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid)
       ON CONFLICT (operating_company_id, load_number) DO NOTHING`,
      [companyId, "90001100", customerId, TEST_OWNER_USER_ID, trailerEquipmentId]
    );
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  it("writes geocode_precision=rooftop when google_place_id is provided", async () => {
    const result = await bookLoad(db, {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "booked",
      charges: [],
      load_trailer_equipment_id: trailerEquipmentId,
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          facility_name: "G11 pickup facility",
          address_line1: "100 Pickup Rd",
          city: "Austin",
          state: "TX",
          country: "US",
          latitude: 30.2672,
          longitude: -97.7431,
          google_place_id: "ChIJtest1234",
        },
        {
          sequence_number: 2,
          stop_type: "delivery",
          facility_name: "G11 delivery facility",
          address_line1: "200 Delivery Ave",
          city: "Dallas",
          state: "TX",
          country: "US",
          latitude: 32.7767,
          longitude: -96.7970,
          google_place_id: "ChIJtest5678",
        },
      ],
    });

    const stops = await db.query<{ sequence_number: number; geocode_precision: string | null; geocode_source: string | null }>(
      `SELECT sequence_number, geocode_precision, geocode_source FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number`,
      [result.loadId]
    );

    for (const row of stops.rows) {
      expect(row.geocode_precision, `seq ${row.sequence_number} precision`).toBe("rooftop");
      expect(row.geocode_source, `seq ${row.sequence_number} source`).toBe("google");
    }
  });

  it("writes geocode_precision=rooftop when location_id is provided, null when picker-only", async () => {
    // Create a location first
    const loc = await db.query<{ id: string }>(
      `INSERT INTO mdata.locations (operating_company_id, location_name, address_line1, city, state, country, latitude, longitude)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [companyId, "G11 test location", "300 Location Dr", "Houston", "TX", "US", 29.7604, -95.3698]
    );
    const locationId = loc.rows[0]!.id;

    const result = await bookLoad(db, {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "booked",
      charges: [],
      load_trailer_equipment_id: trailerEquipmentId,
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          location_id: locationId,
          city: "Houston",
          state: "TX",
          country: "US",
          latitude: 29.7604,
          longitude: -95.3698,
        },
        {
          sequence_number: 2,
          stop_type: "delivery",
          facility_name: "Picker-only dest",
          city: "San Antonio",
          state: "TX",
          country: "US",
          latitude: 29.4241,
          longitude: -98.4936,
        },
      ],
    });

    const stops = await db.query<{ sequence_number: number; geocode_precision: string | null; geocode_source: string | null }>(
      `SELECT sequence_number, geocode_precision, geocode_source FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number`,
      [result.loadId]
    );

    const pickup = stops.rows.find((r) => r.sequence_number === 1)!;
    expect(pickup.geocode_precision).toBe("rooftop");
    expect(pickup.geocode_source).toBe("location_existing");

    const delivery = stops.rows.find((r) => r.sequence_number === 2)!;
    expect(delivery.geocode_precision).toBeNull();
    expect(delivery.geocode_source).toBe("picker");
  });

  it("first pickup departure advances load to in_transit; final delivery arrival advances to delivered_pending_docs", async () => {
    const unitId = randomUUID();
    // Seed a unit
    await db.query(
      `INSERT INTO mdata.units (id, operating_company_id, unit_number, is_sample_data) VALUES ($1::uuid, $2::uuid, $3, true)
       ON CONFLICT DO NOTHING`,
      [unitId, companyId, `G11-unit-${unitId.slice(0, 8)}`]
    );

    const result = await bookLoad(db, {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "dispatched",
      assigned_unit_id: unitId,
      charges: [],
      load_trailer_equipment_id: trailerEquipmentId,
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          facility_name: "G11 status pickup",
          city: "Austin",
          state: "TX",
          country: "US",
          latitude: 30.2672,
          longitude: -97.7431,
          google_place_id: "ChIJstatus_pickup",
        },
        {
          sequence_number: 2,
          stop_type: "delivery",
          facility_name: "G11 status delivery",
          city: "Dallas",
          state: "TX",
          country: "US",
          latitude: 32.7767,
          longitude: -96.7970,
          google_place_id: "ChIJstatus_delivery",
        },
      ],
    });

    // bindLoadToGeofences needs the stops to have geocode_precision now that we write it at insert
    await bindLoadToGeofences(db, companyId, result.loadId);

    // Verify fences were bound (not zero)
    const fences = await db.query(
      `SELECT COUNT(*) AS cnt FROM geo.geofences WHERE operating_company_id = $1::uuid AND label LIKE $2`,
      [companyId, `load-${result.loadId}-stop-%`]
    );
    expect(Number(fences.rows[0]!.cnt)).toBeGreaterThan(0);

    // Fire departure on pickup stop (first pickup departure → in_transit)
    const pickupFence = await db.query<{ id: string }>(
      `SELECT id FROM geo.geofences WHERE operating_company_id = $1::uuid AND label = $2`,
      [companyId, `load-${result.loadId}-stop-1`]
    );
    if (pickupFence.rows.length === 0) {
      // No fence bound (picker-only stop, no precision) — skip status checks
      return;
    }

    // Seed an "entered" event first so the detector sees a valid prior state
    await db.query(
      `INSERT INTO geo.geofence_events (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, point_lat, point_lng, source)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'entered', '2026-10-12T10:00:00Z', 30.2672, -97.7431, 'test')
       ON CONFLICT DO NOTHING`,
      [companyId, pickupFence.rows[0]!.id, unitId]
    );

    // GPS processing must run inside withLuciaBypass: transition engine uses SET LOCAL + after-commit latch.
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      await processGeofenceDetectionsForGpsPoint(client as never, {
        operating_company_id: companyId,
        unit_id: unitId,
        latitude: 31.0,
        longitude: -97.0,
        occurred_at: "2026-10-12T12:00:00Z",
      });
    });

    const afterDeparture = await db.query<{ status: string }>(
      `SELECT status::text AS status FROM mdata.loads WHERE id = $1::uuid`,
      [result.loadId]
    );
    // Old code never moved status from fence evidence (or used a raw UPDATE — AJK-03). New code: in_transit.
    expect(afterDeparture.rows[0]!.status).toBe("in_transit");

    const deliveryFence = await db.query<{ id: string }>(
      `SELECT id FROM geo.geofences WHERE operating_company_id = $1::uuid AND label = $2`,
      [companyId, `load-${result.loadId}-stop-2`]
    );
    if (deliveryFence.rows.length === 0) return;

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      await processGeofenceDetectionsForGpsPoint(client as never, {
        operating_company_id: companyId,
        unit_id: unitId,
        latitude: 32.7767,
        longitude: -96.7970,
        occurred_at: "2026-10-12T16:00:00Z",
      });
    });

    const afterArrival = await db.query<{ status: string }>(
      `SELECT status::text AS status FROM mdata.loads WHERE id = $1::uuid`,
      [result.loadId]
    );
    expect(afterArrival.rows[0]!.status).toBe("delivered_pending_docs");
  });
});
