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
import { bookLoad, type BookLoadInput, type BookLoadResult } from "../book-load.service.js";
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

  // The booking goes through the real one-argument bookLoad(input) (withCurrentUser, commits) — the sibling
  // book-load-save-draft.db.test.ts shape. This file used to call bookLoad(db, input), which handed the pg
  // client to bookLoad AS the input: every booking was refused, `loadId` was undefined, and the stop
  // reads returned 0 rows (the first test's loop passed with no assertion run). A real booking also records an
  // explicit trailer choice — 6882b1ea31 "443.107 Book Load requires trailer choice (#26620)" + 6db7585fb6
  // "R443.161-G1 trailer choice missing at shared load boundary (#26793)" — DSP-49 requires a pickup and
  // delivery appointment, and ROUND 285.3.6 a customer PO / W/O.
  async function bookG11(overrides: Partial<BookLoadInput> & Pick<BookLoadInput, "stops">): Promise<string> {
    const result: BookLoadResult = await bookLoad({
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "assigned_not_dispatched", // the route default; "booked" is not a DispatchStatus (toMdataStatus throws)
      charges: [{ code: "linehaul", amount_cents: 150_000 }],
      load_number: String(800_000_000 + Math.floor(Math.random() * 99_999_999)),
      save_mode: "book_dispatch", // required by BookLoadInput (the wizard's primary action)
      trailer_choice: { kind: "none" },
      customer_po_number: `G11-PO-${randomUUID().slice(0, 8)}`, // ROUND 285.3.6: W/O or PO required at booking
      ...overrides,
    });
    expect(result.kind, `expected ok, got: ${JSON.stringify(result)}`).toBe("ok");
    if (result.kind !== "ok") throw new Error("booking refused");
    return String(result.row.id);
  }
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
  const dayAfter = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

  it("writes geocode_precision=rooftop when google_place_id is provided", async () => {
    const loadId = await bookG11({
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          scheduled_arrival_at: tomorrow(),
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
          scheduled_arrival_at: dayAfter(),
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
      [loadId]
    );

    expect(stops.rows.length, "both stops written").toBe(2);
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

    const loadId = await bookG11({
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          scheduled_arrival_at: tomorrow(),
          location_id: locationId,
          // a204a66200 "443.184 G11 … city locations not rooftop (#26888)": a catalog location is rooftop only when
          // the stop carries its street address (the wizard copies the location's address onto the stop).
          address_line1: "300 Location Dr",
          city: "Houston",
          state: "TX",
          country: "US",
          latitude: 29.7604,
          longitude: -95.3698,
        },
        {
          sequence_number: 2,
          stop_type: "delivery",
          scheduled_arrival_at: dayAfter(),
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
      [loadId]
    );

    expect(stops.rows.length, "both stops written").toBe(2);
    const pickup = stops.rows.find((r) => r.sequence_number === 1)!;
    expect(pickup.geocode_precision).toBe("rooftop");
    expect(pickup.geocode_source).toBe("location_existing");

    const delivery = stops.rows.find((r) => r.sequence_number === 2)!;
    expect(delivery.geocode_precision).toBeNull();
    expect(delivery.geocode_source).toBe("picker");
  });

  it("first pickup departure advances load to in_transit; final delivery arrival advances to delivered_pending_docs", async () => {
    const unitId = randomUUID();
    // Seed a unit. mdata.units is scoped by owner_company_id and requires a VIN (0008_mdata_init.sql) — it has
    // never had an operating_company_id column, so the old INSERT failed before the test reached any assertion.
    await db.query(
      `INSERT INTO mdata.units (id, owner_company_id, unit_number, vin, is_sample_data) VALUES ($1::uuid, $2::uuid, $3, $4, true)
       ON CONFLICT DO NOTHING`,
      [unitId, companyId, `G11-unit-${unitId.slice(0, 8)}`, `1G11${unitId.replace(/-/g, "").slice(0, 13).toUpperCase()}`]
    );

    const loadId = await bookG11({
      status: "dispatched",
      assigned_unit_id: unitId,
      stops: [
        {
          sequence_number: 1,
          stop_type: "pickup",
          scheduled_arrival_at: tomorrow(),
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
          scheduled_arrival_at: dayAfter(),
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
    await bindLoadToGeofences(db, companyId, loadId);

    // Verify fences were bound (not zero)
    const fences = await db.query(
      `SELECT COUNT(*) AS cnt FROM geo.geofences WHERE operating_company_id = $1::uuid AND label LIKE $2`,
      [companyId, `load-${loadId}-stop-%`]
    );
    expect(Number(fences.rows[0]!.cnt)).toBeGreaterThan(0);

    // Fire departure on pickup stop (first pickup departure → in_transit)
    const pickupFence = await db.query<{ id: string }>(
      `SELECT id FROM geo.geofences WHERE operating_company_id = $1::uuid AND label = $2`,
      [companyId, `load-${loadId}-stop-1`]
    );
    // Both stops carry a google_place_id (rooftop), so each is fenced — a missing fence is a failure, not a skip.
    expect(pickupFence.rows.length, "pickup stop fenced").toBeGreaterThan(0);

    // The prior "entered" state comes from the detector itself (a fix inside the pickup fence), the way the live
    // Samsara feed produces it. geo.geofence_events.source is CHECK-limited to 'samsara_gps' | 'manual', so the old
    // hand-seeded event with source 'test' was refused before the test reached any assertion.
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      const entered = await processGeofenceDetectionsForGpsPoint(client as never, {
        operating_company_id: companyId,
        unit_id: unitId,
        latitude: 30.2672,
        longitude: -97.7431,
        occurred_at: "2026-10-12T10:00:00Z",
      });
      expect(entered.stop_arrivals_stamped, "pickup arrival stamped from the fence").toBe(1);
    });

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
      [loadId]
    );
    // Old code never moved status from fence evidence (or used a raw UPDATE — AJK-03). New code: in_transit.
    expect(afterDeparture.rows[0]!.status).toBe("in_transit");

    const deliveryFence = await db.query<{ id: string }>(
      `SELECT id FROM geo.geofences WHERE operating_company_id = $1::uuid AND label = $2`,
      [companyId, `load-${loadId}-stop-2`]
    );
    expect(deliveryFence.rows.length, "delivery stop fenced").toBeGreaterThan(0);

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
      [loadId]
    );
    expect(afterArrival.rows[0]!.status).toBe("delivered_pending_docs");
  });
});
