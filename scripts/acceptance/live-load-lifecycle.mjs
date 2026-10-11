#!/usr/bin/env node
// LEAD 443.70 — ACCEPTANCE RUN of one load's whole life, S1..S7, through the app's REAL routes, on a throwaway fork of
// prod HEAD. Re-run on a fresh fork before every release. Every step asserts by QUERY (FK present, posting on the right
// account_id, field not NULL) — a screenshot is not proof. A failing step = root cause file:line, engine fix, guard, then
// the run again from S1.
//
// FORK ONLY: assertNotProduction refuses the prod branch before anything is written. The app is built in-process
// (Fastify + the real route modules) and authenticated with the CI test header (IH35_TEST_AUTH_BYPASS=1, dead when
// NODE_ENV=production) as the company Owner — no password. Samsara is NEVER written from a fork: run with every SAMSARA_*
// variable unset (the script refuses otherwise); fences are asserted as the enqueued outbox event + Samsara's existing
// address READ back (GET only) with SAMSARA_READ_TOKEN, a name the app never reads. Google runs for real
// (GOOGLE_PLACES_API_KEY, server side — the same key the app uses).
//
// Seats (443.70): S1 / S3 / S4-feed CC-2 · S2 / S5 / S7 CC-3 · S4-bank / S6 Cursor (expected legs from CC-1).
//
// Run: node --env-file=<fork env> --import tsx scripts/acceptance/live-load-lifecycle.mjs [--only=S1,S3]
import pg from "pg";
import { assertNotProduction } from "../lib/assert-not-production.mjs";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const runs = (s) => only.length === 0 || only.includes(s);

for (const k of Object.keys(process.env)) {
  if (/^SAMSARA_/.test(k) && k !== "SAMSARA_READ_TOKEN") {
    console.error(`live-load-lifecycle: REFUSED — ${k} is set; a fork run must never be able to write to Samsara`);
    process.exit(2);
  }
}
if (process.env.NODE_ENV === "production") {
  console.error("live-load-lifecycle: REFUSED — NODE_ENV=production");
  process.exit(2);
}
process.env.IH35_TEST_AUTH_BYPASS = "1";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await assertNotProduction(db, { label: "443.70 live-load-lifecycle acceptance" });
/** Read as the auditor: one transaction, transaction-local bypass (never a session SET on the pooler). */
async function read(sql, values = []) {
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
    return (await db.query(sql, values)).rows;
  } finally {
    await db.query("COMMIT");
  }
}

const results = [];
function step(name) {
  const s = { name, asserts: [] };
  results.push(s);
  return {
    ok(label, cond, detail = "") {
      s.asserts.push({ label, ok: Boolean(cond), detail });
      console.log(`${cond ? "  ok  " : "  FAIL"} ${name} ${label}${detail ? ` — ${detail}` : ""}`);
      return Boolean(cond);
    },
    notNull(label, v) {
      return this.ok(`${label} not NULL`, v !== null && v !== undefined && v !== "", v === null || v === undefined ? "NULL" : String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 80));
    },
  };
}
const metersBetween = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ---- the app, in-process, real route modules ----
const { createIntegrationApp } = await import("../../apps/backend/test-helpers/http-app.ts");
const { registerDispatchLoadRoutes } = await import("../../apps/backend/src/dispatch/loads.routes.ts");
const { registerMilesRecommendationsRoutes } = await import("../../apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts");
const { registerGeocodingRoutes } = await import("../../apps/backend/src/integrations/trimble/geocoding.routes.ts");
const { registerSettlementPayRunCloseRoutes } = await import("../../apps/backend/src/driver-finance/settlement-payrun-close.routes.ts");
const { registerTruckLineStopStampRoutes } = await import("../../apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts");
const app = await createIntegrationApp(async (a) => {
  await registerDispatchLoadRoutes(a);
  await registerMilesRecommendationsRoutes(a);
  await registerGeocodingRoutes(a);
  registerSettlementPayRunCloseRoutes(a);
  await registerTruckLineStopStampRoutes(a);
});
const auth = { "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER, role: "Owner", email: "acceptance@fork.invalid" })).toString("base64url") };
async function call(method, url, payload) {
  const res = await app.inject({ method, url, payload, headers: auth });
  let body = null;
  try { body = res.json(); } catch { body = res.body; }
  return { status: res.statusCode, body };
}

const ctx = {};

// ================= S1 BOOK LOAD (CC-2) =================
async function s1() {
  const t = step("S1");
  const unit = (await read(
    `SELECT u.id::text AS unit_id, d.id::text AS driver_id
       FROM mdata.units u, mdata.drivers d
      WHERE u.id = '478d9f14-b2fd-4cea-a51e-76ec30c39ec7' AND d.id = '61727a46-af2e-4d33-8236-e2d99b737708' AND d.operating_company_id = $1::uuid`, [CO]))[0];
  if (!t.ok("fixture unit + driver exist on the fork", unit)) return;
  const customer = (await read(`SELECT id::text FROM mdata.customers WHERE id = '654ca3b2-9dee-4dba-bb78-7d9e61fe37b0' AND operating_company_id = $1::uuid`, [CO]))[0];
  if (!t.ok("fixture customer exists on the fork", customer)) return;

  // The address picker: the UI's own backend proxy returns the street + Google's place id.
  const pick = await call("GET", `/api/v1/geocoding/search?q=${encodeURIComponent("8220 San Lorenzo Dr, Laredo, TX 78045")}`);
  const hit = Array.isArray(pick.body?.results) ? pick.body.results[0] : null;
  t.ok("address picker answers through the app (200 + a result)", pick.status === 200 && hit, `status ${pick.status}`);
  const pickupPoint = hit && Number.isFinite(hit.lat) ? { lat: hit.lat, lng: hit.lon } : { lat: 27.5875552, lng: -99.5073894 };
  const stops = [
    { stop_type: "pickup", sequence_number: 1, facility_name: "Vilore Foods", address_line1: hit?.address_line1 || "8220 San Lorenzo Dr",
      city: hit?.city || "Laredo", state: hit?.state || "TX", postal_code: hit?.zip || "78045", country: "US",
      google_place_id: hit?.place_id || undefined, latitude: pickupPoint.lat, longitude: pickupPoint.lng,
      scheduled_arrival_at: "2026-10-08T14:00:00Z", time_window_type: "appointment", appointment_start_at: "2026-10-08T14:00:00Z" },
    { stop_type: "delivery", sequence_number: 2, facility_name: "WM 6070R NC SHELBY", address_line1: "200 Walmart Drive", city: "SHELBY",
      state: "NC", postal_code: "28150", country: "US", latitude: 35.3115683, longitude: -81.5796284,
      scheduled_arrival_at: "2026-10-10T14:00:00Z", time_window_type: "appointment", appointment_start_at: "2026-10-10T14:00:00Z" },
  ];
  t.notNull("picked pickup google_place_id", hit?.place_id);

  // Miles: both recommendations, per field, before booking (the Book Load form's own call).
  const rec = await call("POST", "/api/v1/mdata/miles-recommendations", {
    operating_company_id: CO, unit_id: unit.unit_id,
    stops: stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude, city: s.city, state: s.state, postal_code: s.postal_code })),
  });
  t.ok("miles recommendations 200", rec.status === 200, `status ${rec.status}`);
  const fields = rec.body?.fields || {};
  for (const f of ["practical", "short", "empty"]) {
    const r = fields[f] || {};
    t.ok(`miles.${f}: Google shown (value or a stated reason)`, r.google?.value != null || r.google_missing_reason, r.google ? `google ${r.google.value}` : `reason: ${r.google_missing_reason}`);
    t.ok(`miles.${f}: Historical shown (value or a stated reason)`, r.historical?.value != null || r.historical_missing_reason, r.historical ? `historical ${r.historical.value}` : `reason: ${r.historical_missing_reason}`);
  }
  t.notNull("miles.practical Google value (key on the server)", fields.practical?.google?.value);
  t.notNull("miles.empty Google deadhead from the unit's previous stop", fields.empty?.google?.value);
  const choose = (f) => {
    const r = fields[f] || {};
    const source = r.default_source || (r.google ? "google" : r.historical ? "historical" : null);
    const value = source === "google" ? r.google?.value : source === "historical" ? r.historical?.value : null;
    return { source, value, historical: r.historical?.value ?? null, google: r.google?.value ?? null };
  };
  const choice = { practical: choose("practical"), short: choose("short"), empty: choose("empty") };

  const body = {
    operating_company_id: CO, customer_id: customer.id, status: "assigned_not_dispatched", trip_type: "NB",
    override_reason: "443.70 acceptance run on a throwaway fork: owner override of driver documents",
    customer_po_number: "PO-ACCEPT-443-70", customer_wo_number: "WO-ACCEPT-443-70", commodity: "Produce", weight_lbs: 40000,
    assigned_unit_id: unit.unit_id, assigned_primary_driver_id: unit.driver_id,
    miles_practical: choice.practical.value, miles_shortest: choice.short.value, miles_deadhead: choice.empty.value,
    miles_choice: choice, charges: [{ code: "linehaul", amount_cents: 590000 }], stops,
  };
  const booked = await call("POST", "/api/v1/dispatch/loads", body);
  if (!t.ok("POST /api/v1/dispatch/loads 201", booked.status === 201, `status ${booked.status} ${booked.status !== 201 ? JSON.stringify(booked.body).slice(0, 300) : ""}`)) return;
  const loadId = booked.body?.id;
  ctx.loadId = loadId;
  t.notNull("load id", loadId);

  // The after-commit resolver (bookLoad queues geocodeStopsBackfill): wait for it to land, bounded.
  let stopRows = [];
  for (let i = 0; i < 30; i++) {
    stopRows = await read(`SELECT location_id FROM mdata.load_stops WHERE load_id = $1::uuid`, [loadId]);
    if (stopRows.length && stopRows.every((s) => s.location_id)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const L = (await read(
    `SELECT l.load_number, l.customer_id, l.customer_po_number, l.assigned_unit_id, l.assigned_primary_driver_id, l.load_trailer_equipment_id,
            l.miles_practical, l.miles_shortest, l.miles_deadhead, l.loaded_miles, l.mileage_source, l.miles_choice, l.status::text
       FROM mdata.loads l WHERE l.id = $1::uuid`, [loadId]))[0];
  for (const f of ["load_number", "customer_id", "customer_po_number", "assigned_unit_id", "assigned_primary_driver_id",
    "miles_practical", "miles_shortest", "miles_deadhead", "loaded_miles", "mileage_source"]) t.notNull(`load.${f}`, L[f]);
  for (const f of ["practical", "short", "empty"]) {
    t.notNull(`load.miles_choice.${f}.source`, L.miles_choice?.[f]?.source);
    t.notNull(`load.miles_choice.${f}.chosen_by`, L.miles_choice?.[f]?.chosen_by);
  }
  t.ok("load.miles_deadhead = the chosen empty recommendation", Number(L.miles_deadhead) === Number(choice.empty.value), `${L.miles_deadhead} vs ${choice.empty.value}`);

  const S = await read(
    `SELECT s.id::text, s.sequence_number, s.address_line1, s.city, s.state, s.postal_code, s.latitude, s.longitude, s.location_id::text,
            s.geocode_source, s.google_place_id, s.leg_miles, lo.google_place_id AS loc_place_id, lo.address_line1 AS loc_street
       FROM mdata.load_stops s LEFT JOIN mdata.locations lo ON lo.id = s.location_id
      WHERE s.load_id = $1::uuid ORDER BY s.sequence_number`, [loadId]);
  t.ok("2 stops booked", S.length === 2, `${S.length}`);
  for (const s of S) {
    const p = `stop${s.sequence_number}`;
    for (const f of ["address_line1", "city", "state", "postal_code", "latitude", "longitude", "location_id", "geocode_source"]) t.notNull(`${p}.${f}`, s[f]);
    // Street = anything but the resolver's own non-street outcomes (stops-geocode-backfill.service.ts:246 zip / city center).
    t.ok(`${p} resolved to a street (location / Samsara address / Google place)`, /^\s*\d+[a-z]?\s+\S/i.test(s.address_line1 || "") && !["zip_center", "city_center", "picker"].includes(s.geocode_source), `${s.geocode_source}: ${s.address_line1}`);
    if (/google/.test(s.geocode_source || "")) {
      t.notNull(`${p}.google_place_id (Google-resolved)`, s.google_place_id);
      t.notNull(`${p} location google_place_id (Google-resolved)`, s.loc_place_id);
    }
    if (s.sequence_number > 1) t.notNull(`${p}.leg_miles`, s.leg_miles);

    // Fence on the real point, and its Samsara side.
    const g = (await read(
      `SELECT id::text, center_lat, center_lng, radius_m, samsara_address_id, is_active
         FROM geo.geofences WHERE operating_company_id = $1::uuid AND location_ref_id = $2::uuid AND is_active ORDER BY created_at DESC LIMIT 1`, [CO, s.location_id]))[0];
    if (!t.ok(`${p} active fence on its location`, g)) continue;
    const off = metersBetween({ lat: Number(g.center_lat), lng: Number(g.center_lng) }, { lat: Number(s.latitude), lng: Number(s.longitude) });
    t.ok(`${p} fence centred on the stop's point (<= 150 m)`, off <= 150, `${Math.round(off)} m`);
    if (g.samsara_address_id) {
      if (process.env.SAMSARA_READ_TOKEN) {
        const res = await fetch(`https://api.samsara.com/addresses/${encodeURIComponent(g.samsara_address_id)}`, {
          headers: { Authorization: `Bearer ${process.env.SAMSARA_READ_TOKEN}` },
        });
        const a = res.ok ? (await res.json()).data : null;
        const circle = a?.geofence?.circle;
        t.ok(`${p} fence read back from Samsara (GET /addresses/${g.samsara_address_id})`, Boolean(a), `HTTP ${res.status}`);
        if (circle) {
          const d = metersBetween({ lat: circle.latitude, lng: circle.longitude }, { lat: Number(s.latitude), lng: Number(s.longitude) });
          t.ok(`${p} Samsara fence centred on the stop's point (<= 150 m)`, d <= 150, `${Math.round(d)} m`);
        }
      } else t.ok(`${p} Samsara read-back (SAMSARA_READ_TOKEN absent — not proven)`, false);
    } else {
      const ev = (await read(
        `SELECT id::text FROM outbox.events WHERE event_type = 'samsara.create_geofence' AND payload::text LIKE '%' || $1 || '%' LIMIT 1`, [g.id]))[0];
      t.ok(`${p} new fence queued for Samsara (samsara.create_geofence outbox event)`, ev, ev ? `event ${ev.id.slice(0, 8)}` : "no event, no samsara_address_id");
    }
  }
  ctx.stops = S;
}

// ================= S3 IN TRANSIT (CC-2) =================
// One REAL delivered load: its truck's recorded Samsara GPS fixes are replayed, in time order, through the live detector
// (processGeofenceDetectionsForGpsPoint — the same function the Samsara position poll calls). On the fork only, the load's
// stop stamps and that truck's fence events for the window are cleared first, so every stamp read back afterwards was
// made by an event during this run — not by hand, not by a backfill.
async function pickRealDeliveredLoad() {
  return (await read(
    `SELECT l.id::text, l.load_number, l.assigned_unit_id::text AS unit_id, l.assigned_primary_driver_id::text AS driver_id,
            min(coalesce(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)) - interval '36 hours' AS w_start,
            max(coalesce(s.actual_departure_at, s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)) + interval '48 hours' AS w_end
       FROM mdata.loads l
       JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
      WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND l.status::text IN ('delivered', 'invoiced', 'paid', 'closed', 'completed')
        AND l.assigned_unit_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM fuel.fuel_transactions ft WHERE ft.load_id = l.id AND ft.voided_at IS NULL AND ft.archived_at IS NULL)
      GROUP BY l.id
     HAVING count(*) >= 2
        AND bool_and(s.location_id IS NOT NULL AND EXISTS (SELECT 1 FROM geo.geofences g WHERE g.location_ref_id = s.location_id AND g.is_active))
        AND (SELECT count(*) FROM telematics.vehicle_locations v WHERE v.unit_id = l.assigned_unit_id
              AND v.captured_at BETWEEN min(coalesce(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)) - interval '12 hours'
                                    AND max(coalesce(s.actual_departure_at, s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)) + interval '12 hours') > 50
      ORDER BY max(s.scheduled_arrival_at) DESC
      LIMIT 1`, [CO]))[0];
}

async function s3() {
  const t = step("S3");
  const load = await pickRealDeliveredLoad();
  if (!t.ok("a real delivered load with fenced stops, GPS fixes and fuel exists", load)) return;
  ctx.realLoad = load;
  console.log(`  S3 load ${load.load_number} (${load.id}) unit ${load.unit_id} window ${new Date(load.w_start).toISOString()} .. ${new Date(load.w_end).toISOString()}`);
  const before = await read(
    `SELECT s.id::text, s.sequence_number, s.latitude, s.longitude, s.actual_arrival_source, s.status::text, l.status::text AS load_status
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
      WHERE s.load_id = $1::uuid AND s.soft_deleted_at IS NULL ORDER BY s.sequence_number`, [load.id]);
  // FORK-ONLY RESET (assertNotProduction ran first): this real load ran before it was booked (seeded after the trip), so it
  // never had a live stop fence while moving. Put it back in transit with no stamps, exactly as it stood on the road; the
  // cron's own binder and the live detector do the rest. Recorded fence events are not touched (immutable evidence).
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query(`UPDATE mdata.loads SET status = 'in_transit' WHERE id = $1::uuid`, [load.id]);
  await db.query(
    `UPDATE mdata.load_stops SET actual_arrival_at = NULL, actual_arrival_source = NULL, actual_departure_at = NULL, actual_departure_source = NULL,
            actual_stop_event_id = NULL, actual_stamp_precision = NULL, status = 'pending' WHERE load_id = $1::uuid`, [load.id]);
  await db.query("COMMIT");
  t.ok("fork reset: load back in transit, stop stamps cleared", true, `was ${before[0]?.load_status}, stops ${before.map((b) => `${b.actual_arrival_source ?? "NULL"}/${b.status}`).join(", ")}`);

  // The cron's binder (cron/load-stop-geofence-sync.cron.ts -> syncLoadStopGeofences -> bindLoadToGeofences).
  const { syncLoadStopGeofences } = await import("../../apps/backend/src/telematics/load-stop-geofence-sync.service.ts");
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  const bound = await syncLoadStopGeofences(db, CO);
  await db.query("COMMIT");
  const stopFences = await read(`SELECT label FROM geo.geofences WHERE operating_company_id = $1::uuid AND is_active AND label LIKE $2`, [CO, `load-${load.id}-stop-%`]);
  t.ok("binder minted a live fence for every stop", stopFences.length === before.length, `${stopFences.length}/${before.length} (created ${bound.created}, skipped low precision ${bound.skipped})`);

  // Replay the truck's recorded Samsara GPS fixes near the stops, in time order, through the live detector.
  const fixes = await read(
    `SELECT v.lat, v.lng, v.captured_at FROM telematics.vehicle_locations v
      WHERE v.unit_id = $1::uuid AND v.captured_at BETWEEN $2 AND $3 AND v.lat IS NOT NULL AND v.lng IS NOT NULL
        AND EXISTS (SELECT 1 FROM unnest($4::float8[], $5::float8[]) AS p(lat, lng)
                     WHERE abs(v.lat - p.lat) < 0.03 AND abs(v.lng - p.lng) < 0.03)
      ORDER BY v.captured_at`,
    [load.unit_id, load.w_start, load.w_end, before.map((s) => Number(s.latitude)), before.map((s) => Number(s.longitude))]);
  t.ok("recorded Samsara GPS fixes near the stops to replay", fixes.length > 0, `${fixes.length} fixes`);
  const { processGeofenceDetectionsForGpsPoint } = await import("../../apps/backend/src/telematics/geofence-detector.service.ts");
  let transitions = 0, stamped = 0;
  for (const f of fixes) {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await db.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
    const r = await processGeofenceDetectionsForGpsPoint(db, {
      operating_company_id: CO, unit_id: load.unit_id, latitude: Number(f.lat), longitude: Number(f.lng),
      occurred_at: new Date(f.captured_at).toISOString(), source: "samsara_gps", driver_id: load.driver_id,
    });
    await db.query("COMMIT");
    transitions += r.transitions_written;
    stamped += r.stop_arrivals_stamped;
  }
  t.ok("replay wrote fence entry/exit events", transitions > 0, `${transitions} transitions, ${stamped} arrivals stamped`);
  // The odometer at each crossing is the 10-minute cron's engine (cron/geofence-odometer-captures.cron.ts) — run it once,
  // as production would within ten minutes of the crossing.
  const { captureGeofenceOdometerEvents } = await import("../../apps/backend/src/integrations/samsara/geofences/geofence-odometer-capture.service.ts");
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const captures = await captureGeofenceOdometerEvents(db, { operatingCompanyId: CO });
  await db.query("COMMIT");
  t.ok("odometer capture engine ran over the replayed crossings", true, `${captures.length} capture(s)`);
  const after = await read(
    `SELECT s.id::text, s.sequence_number, s.actual_arrival_at, s.actual_arrival_source, s.actual_departure_at, s.actual_departure_source,
            s.status::text, g.id::text AS fence_id,
            (SELECT min(ge.occurred_at) FROM geo.geofence_events ge WHERE ge.geofence_id = g.id AND ge.unit_id = $2::uuid AND ge.event_kind = 'entered') AS fence_entered_at,
            (SELECT min(ge.occurred_at) FROM geo.geofence_events ge WHERE ge.geofence_id = g.id AND ge.unit_id = $2::uuid AND ge.event_kind = 'exited') AS fence_exited_at,
            (SELECT oc.odometer_mi FROM geo.geofence_events ge JOIN telematics.geofence_odometer_captures oc ON oc.geofence_event_id = ge.id
              WHERE ge.geofence_id = g.id AND ge.unit_id = $2::uuid AND ge.event_kind = 'entered' ORDER BY ge.occurred_at LIMIT 1) AS odometer_at_entry
       FROM mdata.load_stops s
       LEFT JOIN geo.geofences g ON g.operating_company_id = $3::uuid AND g.is_active AND g.label = 'load-' || s.load_id::text || '-stop-' || s.sequence_number::text
      WHERE s.load_id = $1::uuid AND s.soft_deleted_at IS NULL ORDER BY s.sequence_number`, [load.id, load.unit_id, CO]);
  for (const s of after) {
    const p = `load ${load.load_number} stop${s.sequence_number}`;
    if (!s.fence_entered_at) {
      // Say WHY: the truck's nearest recorded fix to this stop's point in the window (a stop point the truck never visited
      // is a document / address defect, not a detector one).
      const near = (await read(
        `SELECT round(min(2 * 6371 * asin(sqrt(power(sin(radians((v.lat - st.latitude) / 2)), 2)
                  + cos(radians(st.latitude)) * cos(radians(v.lat)) * power(sin(radians((v.lng - st.longitude) / 2)), 2))))::numeric, 1) AS km
           FROM telematics.vehicle_locations v, mdata.load_stops st
          WHERE st.id = $1::uuid AND v.unit_id = $2::uuid AND v.captured_at BETWEEN $3 AND $4`, [s.id, load.unit_id, load.w_start, load.w_end]))[0];
      t.ok(`${p} fence entered by the truck during the replay`, false, `the truck's nearest recorded fix was ${near?.km ?? "?"} km from this stop's point`);
    } else t.notNull(`${p} fence entered by the truck during the replay`, s.fence_entered_at);
    t.ok(`${p} arrival moved by the fence event (source eld_geofence)`, s.actual_arrival_source === "eld_geofence" && s.actual_arrival_at, `${s.actual_arrival_source ?? "NULL"}`);
    t.ok(`${p} arrival = the fence entry time`, s.actual_arrival_at && s.fence_entered_at && new Date(s.actual_arrival_at).getTime() === new Date(s.fence_entered_at).getTime());
    t.ok(`${p} departure moved by the fence exit`, s.actual_departure_source === "eld_geofence" && s.actual_departure_at, `${s.actual_departure_source ?? "NULL"}`);
    t.ok(`${p} stop status moved (arrived / departed)`, ["arrived", "departed"].includes(s.status), `${s.status}`);
    t.notNull(`${p} odometer at entry (fence event -> geofence_odometer_captures)`, s.odometer_at_entry);
  }
}

// ================= S4 DIESEL — feed + recommendation (CC-2) =================
// On the same real load: every live fuel row of its truck inside the load's window is RECOMMENDED to the load by the app's
// suggestion route, and its expense document is born with the item for its fuel type, the account FROM that item, the
// funding account of its card, and load / unit / driver / trailer stamped, posted on that account.
const FUEL_ITEM = { diesel: ["Fuel-Truck Diesel", "5000"], def: ["Fuel-DEF-Diesel Exhaust Fluid", "5010"], reefer_diesel: ["Fuel-Reefer-Diesel", "5015"] };
async function s4feed() {
  const t = step("S4-feed");
  const load = ctx.realLoad || (await pickRealDeliveredLoad());
  if (!t.ok("the S3 real load", load)) return;
  // Design (443.70 S4, owner): RECOMMENDED to the load, not auto-assigned. Today the Dreamline import and the Relay bridge
  // assign load_id themselves (fuel/fuel-transaction-import.ts:312 resolveLoadId, called :384; relay-fuel-canonical-bridge.ts:72).
  t.ok("fuel -> load is a recommendation the user accepts (no import auto-assigns load_id)", false,
    "fuel/fuel-transaction-import.ts:384 + integrations/relay-payments/relay-fuel-canonical-bridge.ts:72 assign load_id on import");
  const rows = await read(
    `SELECT ft.id::text, ft.fuel_type, ft.transaction_at::date::text AS day, ft.relay_fuel_transaction_id IS NOT NULL AS is_relay,
            round(ft.total_cost * 100)::bigint AS cents, ft.load_id::text
       FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid AND ft.unit_id = $2::uuid AND ft.voided_at IS NULL AND ft.archived_at IS NULL
        AND ft.transaction_at BETWEEN $3 AND $4 ORDER BY ft.transaction_at`, [CO, load.unit_id, load.w_start, load.w_end]);
  t.ok("fuel purchases by the truck inside the load's window", rows.length > 0, `${rows.length}`);
  const { registerExpenseLoadLookupRoutes } = await import("../../apps/backend/src/accounting/load-lookup.routes.ts");
  const app2 = await createIntegrationApp(async (a) => { await registerExpenseLoadLookupRoutes(a); });
  try {
    for (const r of rows) {
      const p = `fuel ${r.id.slice(0, 8)} ${r.fuel_type} ${r.day}`;
      const res = await app2.inject({ method: "GET", headers: auth,
        url: `/api/v1/expenses/suggest-load?operating_company_id=${CO}&unit_id=${load.unit_id}&driver_id=${load.driver_id}&transaction_date=${r.day}` });
      const sug = res.statusCode === 200 ? res.json().data : null;
      t.ok(`${p} recommended to load ${load.load_number}`, sug?.load_id === load.id, sug ? `${sug.load_number} (${sug.confidence})` : `HTTP ${res.statusCode}, no suggestion`);
      t.ok(`${p} on load ${load.load_number}`, r.load_id === load.id, r.load_id ? r.load_id.slice(0, 8) : "NULL");
      const e = (await read(
        `SELECT e.id::text, e.load_id::text, e.unit_id::text, e.driver_uuid::text, e.trailer_id::text, e.journal_entry_id::text,
                pa.account_number AS pay_acct
           FROM accounting.expenses e LEFT JOIN catalogs.accounts pa ON pa.id = e.payment_account_uuid
          WHERE e.voided_at IS NULL AND (e.source_fuel_transaction_id = $1::uuid
             -- one Relay fill = one document: its DEF / reefer rows ride the fill's document as their own lines
             OR e.source_fuel_transaction_id IN (SELECT sib.id FROM fuel.fuel_transactions sib JOIN fuel.fuel_transactions me ON me.id = $1::uuid
                                                 WHERE me.relay_fuel_transaction_id IS NOT NULL AND sib.relay_fuel_transaction_id = me.relay_fuel_transaction_id))
          ORDER BY (e.source_fuel_transaction_id = $1::uuid) DESC LIMIT 1`, [r.id]))[0];
      if (!t.ok(`${p} expense document exists`, e)) continue;
      for (const f of ["load_id", "unit_id", "driver_uuid", "trailer_id", "journal_entry_id"]) t.notNull(`${p} expense.${f}`, e[f]);
      t.ok(`${p} paid from its card's funding account`, e.pay_acct === (r.is_relay ? "1295" : "2510"), `${e.pay_acct}`);
      const lines = await read(
        `SELECT i.item_name, a.account_number, (i.default_expense_account_id = el.expense_account_uuid) AS acct_from_item,
                EXISTS (SELECT 1 FROM accounting.journal_entry_postings jp JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid
                         WHERE jp.journal_entry_uuid = $2::uuid AND jp.account_id = el.expense_account_uuid AND jp.debit_or_credit = 'debit'
                           AND je.reversed_by_je_id IS NULL) AS posted_on_it
           FROM accounting.expense_lines el LEFT JOIN catalogs.items i ON i.id = el.item_id LEFT JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
          WHERE el.expense_id = $1::uuid`, [e.id, e.journal_entry_id]);
      const want = FUEL_ITEM[r.fuel_type];
      const main = lines.find((l) => want && l.item_name === want[0]) || lines.find((l) => l.item_name !== "Fuel Card Fee");
      t.ok(`${p} line item = ${want ? want[0] : "(no item for this fuel type)"}`, want && main?.item_name === want[0], main?.item_name ?? "NULL");
      t.ok(`${p} line account = ${want ? want[1] : "?"} and comes from the item`, want && main?.account_number === want[1] && main?.acct_from_item, `${main?.account_number ?? "NULL"} from item: ${main?.acct_from_item}`);
      t.ok(`${p} posted on that account`, main?.posted_on_it);
      for (const fee of lines.filter((l) => l.item_name === "Fuel Card Fee")) t.ok(`${p} card fee on 5005 from the item`, fee.account_number === "5005" && fee.acct_from_item);
    }
  } finally {
    await app2.close();
  }
}


// ================= S2 AT PICKUP / S5 DELIVERY / S7 SETTLEMENT CLOSE (CC-3) =================
// One load through dispatch -> in transit -> delivered -> the driver's pre-settlement closed, all through the app's real
// routes (PATCH /api/v1/dispatch/loads/:id/transition, POST /api/v1/driver-finance/settlements/:id/payrun-close), asserted
// by query. Uses S1's load; when S1 is not run (no Google key in this environment) it books its own load through the same
// POST /api/v1/dispatch/loads with fixed points and the miles chosen manually (with a reason).
const acct = async (n) => (await read(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2`, [CO, n]))[0]?.id ?? null;
async function ensureLoad(t) {
  if (ctx.loadId) return ctx.loadId;
  const unit = (await read(
    `SELECT u.id::text AS unit_id, d.id::text AS driver_id FROM mdata.units u, mdata.drivers d
      WHERE u.id = '478d9f14-b2fd-4cea-a51e-76ec30c39ec7' AND d.id = '61727a46-af2e-4d33-8236-e2d99b737708' AND d.operating_company_id = $1::uuid`, [CO]))[0];
  const customer = (await read(`SELECT id::text FROM mdata.customers WHERE id = '654ca3b2-9dee-4dba-bb78-7d9e61fe37b0' AND operating_company_id = $1::uuid`, [CO]))[0];
  if (!t.ok("fixture unit + driver + customer exist on the fork", unit && customer)) return null;
  const manual = (v) => ({ source: "manual", value: v, manual_reason: "443.70 acceptance: fixed miles, no Google key in this run", historical: null, google: null });
  const booked = await call("POST", "/api/v1/dispatch/loads", {
    operating_company_id: CO, customer_id: customer.id, status: "assigned_not_dispatched", trip_type: "NB",
    override_reason: "443.70 acceptance run on a throwaway fork: owner override of driver documents",
    customer_po_number: "PO-ACCEPT-443-70-S2", commodity: "Produce", weight_lbs: 40000,
    assigned_unit_id: unit.unit_id, assigned_primary_driver_id: unit.driver_id,
    miles_practical: 1210, miles_shortest: 1180, miles_deadhead: 12,
    miles_choice: { practical: manual(1210), short: manual(1180), empty: manual(12) },
    charges: [{ code: "linehaul", amount_cents: 590000 }],
    stops: [
      { stop_type: "pickup", sequence_number: 1, facility_name: "Vilore Foods", address_line1: "8220 San Lorenzo Dr", city: "Laredo", state: "TX",
        postal_code: "78045", country: "US", latitude: 27.5875552, longitude: -99.5073894, scheduled_arrival_at: "2026-10-08T14:00:00Z",
        time_window_type: "appointment", appointment_start_at: "2026-10-08T14:00:00Z" },
      { stop_type: "delivery", sequence_number: 2, facility_name: "WM 6070R NC SHELBY", address_line1: "200 Walmart Drive", city: "SHELBY", state: "NC",
        postal_code: "28150", country: "US", latitude: 35.3115683, longitude: -81.5796284, scheduled_arrival_at: "2026-10-10T14:00:00Z",
        time_window_type: "appointment", appointment_start_at: "2026-10-10T14:00:00Z" },
    ],
  });
  if (!t.ok("POST /api/v1/dispatch/loads 201 (S2's own load)", booked.status === 201, `status ${booked.status} ${booked.status !== 201 ? JSON.stringify(booked.body).slice(0, 300) : ""}`)) return null;
  ctx.loadId = booked.body?.id;
  return ctx.loadId;
}
const transition = (loadId, new_status, extra = {}) =>
  call("PATCH", `/api/v1/dispatch/loads/${loadId}/transition?operating_company_id=${CO}`, { new_status, ...extra });

async function s2() {
  const t = step("S2");
  const loadId = await ensureLoad(t);
  if (!loadId) return;
  // Pickup the way the app records it: the office (or the driver / the geofence) stamps arrival and departure at the first
  // pickup stop (POST /api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/arrive|depart) — the proforma mints on that
  // evidence (accounting/proforma-mint-on-first-pickup.ts), never on a status change alone.
  const cur = (await read(`SELECT status::text FROM mdata.loads WHERE id = $1::uuid`, [loadId]))[0]?.status;
  if (cur === "assigned_not_dispatched") {
    const r = await transition(loadId, "dispatched");
    t.ok("transition -> dispatched (200)", r.status === 200, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 200) : ""}`);
  }
  const pick = (await read(`SELECT id::text FROM mdata.load_stops WHERE load_id = $1::uuid AND stop_type = 'pickup' ORDER BY sequence_number LIMIT 1`, [loadId]))[0];
  for (const ev of ["arrive", "depart"]) {
    const r = await call("POST", `/api/v1/dispatch/truck-line/loads/${loadId}/stops/${pick.id}/${ev}`, { operating_company_id: CO });
    t.ok(`pickup stop ${ev} stamped (200)`, r.status === 200, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 200) : ""}`);
  }
  const after = (await read(`SELECT status::text FROM mdata.loads WHERE id = $1::uuid`, [loadId]))[0]?.status;
  if (after !== "in_transit") {
    const r = await transition(loadId, "in_transit");
    t.ok("transition -> in_transit (200)", r.status === 200, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 200) : ""}`);
  } else t.ok("load in_transit after pickup departure", true);
  const L = (await read(`SELECT load_number, assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id, customer_id::text FROM mdata.loads WHERE id = $1::uuid`, [loadId]))[0];
  ctx.load = L;
  // Pre-invoice (proforma): exists, its line carries "Line Haul" on "Freight / Line-haul Income" (4000), and posts NOTHING.
  const inv = (await read(
    `SELECT i.id::text, i.status, i.display_id FROM accounting.invoices i
      WHERE i.source_load_id = $1::uuid AND i.voided_at IS NULL ORDER BY i.created_at DESC LIMIT 1`, [loadId]))[0];
  if (t.ok("pre-invoice exists for the load", inv, inv ? `${inv.display_id} ${inv.status}` : "none")) {
    ctx.invoiceId = inv.id;
    t.ok("pre-invoice status is proforma", inv.status === "proforma", inv.status);
    const line = (await read(
      `SELECT it.item_name, a.account_number FROM accounting.invoice_lines il
         LEFT JOIN catalogs.items it ON it.id = il.item_id LEFT JOIN catalogs.accounts a ON a.id = il.account_id
        WHERE il.invoice_id = $1::uuid AND il.line_type = 'linehaul' AND il.soft_deleted_at IS NULL LIMIT 1`, [inv.id]))[0];
    t.ok("pre-invoice line item = Line Haul", line?.item_name === "Line Haul", line?.item_name ?? "no item");
    t.ok("pre-invoice line account = 4000", line?.account_number === "4000", line?.account_number ?? "none");
    const posted = (await read(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'invoice' AND p.source_transaction_id = $2`, [CO, inv.id]))[0].n;
    t.ok("pre-invoice posts nothing (no A/R 1100, no income)", posted === 0, `${posted} posting(s)`);
  }
  // Driver bill: minted, number = load number, driver + load stamped.
  const db = (await read(
    `SELECT id::text, bill_number, driver_id::text, load_number, gross_amount_cents, status FROM driver_finance.driver_bills
      WHERE load_id = $1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`, [loadId]))[0];
  if (t.ok("driver bill minted for the load", db, db ? `${db.bill_number} ${db.status} ${db.gross_amount_cents}` : "none")) {
    t.ok("driver bill number = load number", String(db.bill_number) === String(L.load_number), `${db.bill_number} vs ${L.load_number}`);
    t.ok("driver bill names the load's driver", db.driver_id === L.driver_id);
    t.ok("driver bill priced (per-mile driver: gross > 0)", Number(db.gross_amount_cents) > 0, String(db.gross_amount_cents));
  }
  // Pre-settlement (tour): an open load-bookended settlement for the driver anchored on this load.
  const ps = (await read(
    `SELECT id::text, status, settlement_model, first_load_id::text FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND voided_at IS NULL
        AND (first_load_id = $3::uuid OR last_load_id = $3::uuid OR EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = driver_settlements.id AND sl.load_id = $3::uuid))
      ORDER BY created_at DESC LIMIT 1`, [CO, L.driver_id, loadId]))[0];
  if (t.ok("pre-settlement (tour) opened for the driver on this load", ps, ps ? `${ps.status} ${ps.settlement_model}` : "none")) ctx.settlementId = ps.id;
}

async function s5() {
  const t = step("S5");
  const loadId = ctx.loadId;
  if (!t.ok("S2 ran (load in transit)", loadId)) return;
  // Delivery the way the app records it: arrival + departure stamped at the delivery stop (office stop-stamp route; the
  // geofence detector and the driver app write the same stamps), then the load moves to delivered. An office "delivered"
  // transition alone stamps departure only (load-transition.service.ts) and the invoice feed gate refuses a stop with no arrival.
  const drop = (await read(`SELECT id::text FROM mdata.load_stops WHERE load_id = $1::uuid AND stop_type = 'delivery' ORDER BY sequence_number DESC LIMIT 1`, [loadId]))[0];
  for (const ev of ["arrive", "depart"]) {
    const x = await call("POST", `/api/v1/dispatch/truck-line/loads/${loadId}/stops/${drop.id}/${ev}`, { operating_company_id: CO });
    t.ok(`delivery stop ${ev} stamped (200)`, x.status === 200, `status ${x.status} ${x.status !== 200 ? JSON.stringify(x.body).slice(0, 200) : ""}`);
  }
  const now = (await read(`SELECT status::text FROM mdata.loads WHERE id = $1::uuid`, [loadId]))[0]?.status;
  const r = now === "delivered_pending_docs" ? { status: 200 } : await transition(loadId, "delivered_pending_docs", { delivered_at: "2026-10-10T16:00:00Z" });
  t.ok("transition -> delivered_pending_docs (200)", r.status === 200, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 200) : ""}`);
  // Earn at delivery, bill at POD (auto-invoice-on-bol.service.ts): the POD arrives. Object storage (R2) does not exist on a
  // fork, so the completed upload's own record + load link are written here exactly as the upload route writes them, and the
  // upload's own trigger (docs/maybe-fire-auto-invoice-after-bol.ts) runs — the same engine call the upload route makes.
  const { maybeFireAutoInvoiceAfterBolSaved } = await import("../../apps/backend/src/docs/maybe-fire-auto-invoice-after-bol.ts");
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.bypass_rls','lucia',true), set_config('app.operating_company_id',$1,true)", [CO]);
    const f = (await db.query(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, sha256_hash, r2_bucket, r2_key,
                               upload_completed_at, category_id, uploader_user_id, document_date)
       VALUES ($1::uuid, 'POD-acceptance.pdf', 'application/pdf', 1024, md5(random()::text) || md5(random()::text), 'fork', 'fork/pod-acceptance-' || gen_random_uuid()::text || '.pdf',
               now(), (SELECT id FROM catalogs.file_categories WHERE code = 'pod' LIMIT 1), $2::uuid, '2026-10-10')
       RETURNING id::text`, [CO, OWNER])).rows[0].id;
    await db.query(`INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1::uuid, 'load', $2::uuid, $3::uuid)`, [f, loadId, OWNER]);
    await maybeFireAutoInvoiceAfterBolSaved({ client: db, fileId: f, actorUserId: OWNER });
    await db.query("COMMIT");
    t.ok("POD saved on the load and the upload trigger ran", true, f.slice(0, 8));
  } catch (e) {
    await db.query("ROLLBACK");
    t.ok("POD saved on the load and the upload trigger ran", false, String(e.message).slice(0, 200));
  }
  let inv = null;
  for (let i = 0; i < 15; i++) {
    inv = (await read(`SELECT i.id::text, i.status, i.display_id, i.customer_id::text, i.total_cents FROM accounting.invoices i
       WHERE i.source_load_id = $1::uuid AND i.voided_at IS NULL ORDER BY i.created_at DESC LIMIT 1`, [loadId]))[0];
    if (inv && inv.status !== "proforma") break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  if (!t.ok("invoice converted from the proforma", inv && inv.status !== "proforma", inv ? `${inv.display_id} ${inv.status}` : "none")) return;
  t.ok("invoice number carries the load number", String(inv.display_id ?? "").includes(String(ctx.load?.load_number ?? "")), `${inv.display_id} / load ${ctx.load?.load_number}`);
  // Two-event revenue recognition (revrec-delivery-posting/poster.service.ts; 443-70 designed behaviour, S5):
  //   earn at delivery  Dr Unbilled Revenue (1150) / Cr Freight / Line-haul Income (4000)
  //   bill at send      Dr Accounts Receivable (A/R) (1100) / Cr Unbilled Revenue (1150), the A/R line sourced to the invoice
  // Every leg names the customer. The bill event runs after its commit — polled, bounded.
  const [a1100, a1150, a4000] = [await acct("1100"), await acct("1150"), await acct("4000")];
  let legs = [];
  for (let i = 0; i < 15; i++) {
    legs = await read(
      `SELECT p.account_id::text, p.debit_or_credit, p.amount_cents::bigint AS c, p.entity_uuid::text, p.source_transaction_type AS st, p.source_transaction_id AS sid
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL
        WHERE p.operating_company_id = $1::uuid AND p.reversed_by_line_id IS NULL
          AND ((p.source_transaction_type = 'load' AND p.source_transaction_id = $2) OR (p.source_transaction_type = 'invoice' AND p.source_transaction_id = $3))`,
      [CO, loadId, inv.id]);
    if (legs.some((l) => l.account_id === a1100)) break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  const find = (acc, side) => legs.find((l) => l.account_id === acc && l.debit_or_credit === side);
  const earnDr = find(a1150, "debit"), earnCr = find(a4000, "credit"), arDr = find(a1100, "debit"), billCr = find(a1150, "credit");
  t.ok("earn: Dr Unbilled Revenue 1150", earnDr, earnDr ? String(Number(earnDr.c) / 100) : "none");
  t.ok("earn: Cr Freight / Line-haul Income 4000", earnCr, earnCr ? String(Number(earnCr.c) / 100) : "none");
  t.ok("bill: Dr Accounts Receivable (A/R) 1100", arDr, arDr ? String(Number(arDr.c) / 100) : "none");
  t.ok("bill: Cr Unbilled Revenue 1150 (unbilled cleared)", billCr, billCr ? String(Number(billCr.c) / 100) : "none");
  t.ok("A/R = invoice total", arDr && Number(arDr.c) === Number(inv.total_cents), `${arDr?.c} vs ${inv.total_cents}`);
  t.ok("A/R line sourced to the invoice", arDr && arDr.st === "invoice" && arDr.sid === inv.id, arDr ? `${arDr.st} ${String(arDr.sid).slice(0, 8)}` : "none");
  t.ok("customer on every revenue leg", legs.length > 0 && legs.every((l) => l.entity_uuid === inv.customer_id), `${legs.filter((l) => l.entity_uuid === inv.customer_id).length}/${legs.length}`);
  const line = (await read(`SELECT it.item_name FROM accounting.invoice_lines il LEFT JOIN catalogs.items it ON it.id = il.item_id
     WHERE il.invoice_id = $1::uuid AND il.line_type = 'linehaul' AND il.soft_deleted_at IS NULL LIMIT 1`, [inv.id]))[0];
  t.ok("invoice line still Line Haul", line?.item_name === "Line Haul", line?.item_name ?? "none");
}

async function s7() {
  const t = step("S7");
  const sid = ctx.settlementId;
  if (!t.ok("S2 opened a pre-settlement", sid)) return;
  const r = await call("POST", `/api/v1/driver-finance/settlements/${sid}/payrun-close`, { operating_company_id: CO });
  t.ok("POST payrun-close 200", r.status === 200, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 300) : ""}`);
  const S = (await read(`SELECT status, net_pay, gross_pay FROM driver_finance.driver_settlements WHERE id = $1::uuid`, [sid]))[0];
  t.ok("driver settlement closed", ["closed", "paid", "posted"].includes(S?.status), S?.status);
  const gl = await read(
    `SELECT g.load_id::text, g.accounting_bill_id::text, g.gross_cents, g.cash_cents FROM driver_finance.driver_settlement_gl_bills g
      WHERE g.settlement_id = $1::uuid AND g.superseded_at IS NULL`, [sid]);
  t.ok("company settlement: one A/P bill per load", gl.length > 0 && gl.every((g) => g.accounting_bill_id), `${gl.length} row(s)`);
  const lines = await read(
    `SELECT bl.item_id::text, bl.account_id::text, it.default_expense_account_id::text AS item_acct, b.driver_id::text, bl.load_id::text
       FROM driver_finance.driver_settlement_gl_bills g JOIN accounting.bills b ON b.id = g.accounting_bill_id
       JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.voided_at IS NULL LEFT JOIN catalogs.items it ON it.id = bl.item_id
      WHERE g.settlement_id = $1::uuid AND g.superseded_at IS NULL`, [sid]);
  t.ok("every A/P bill line has its pay item", lines.length > 0 && lines.every((l) => l.item_id), `${lines.filter((l) => l.item_id).length}/${lines.length}`);
  t.ok("every A/P bill line on its item's account", lines.every((l) => l.account_id === l.item_acct), `${lines.filter((l) => l.account_id === l.item_acct).length}/${lines.length}`);
  t.ok("every A/P bill line carries the load + the bill the driver", lines.every((l) => l.load_id && l.driver_id === ctx.load?.driver_id));
  // A/P tie-out (443-70 designed behaviour, S7): per settlement, the bills' A/P credit = the deduction JE's A/P debit + the net
  // bill payment's A/P debit — 0 variance. (The close posts the net bill payment itself; listed: it credits the operating bank.)
  const a2000 = await acct("2000");
  const apNet = (await read(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS v,
            COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit' AND p.source_transaction_type = 'bill'), 0)::bigint AS gross
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL
      WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND p.reversed_by_line_id IS NULL
        AND ((p.source_transaction_type = 'bill' AND p.source_transaction_id = ANY($3::text[]))
          OR (p.source_transaction_type = 'driver_settlement' AND p.source_transaction_id = $4)
          OR (p.source_transaction_type = 'bill_payment' AND p.source_transaction_id IN (
                SELECT bp.id::text FROM accounting.bill_payments bp WHERE bp.bill_id::text = ANY($3::text[]))))`,
    [CO, a2000, gl.map((g) => g.accounting_bill_id), sid]))[0];
  t.ok("A/P gross posted for the settlement's bills", Number(apNet.gross) > 0, (Number(apNet.gross) / 100).toFixed(2));
  t.ok("A/P tie-out: gross = deductions + net payment (0 variance)", Number(apNet.v) === 0, `variance ${(Number(apNet.v) / 100).toFixed(2)}`);
  const tb = (await read(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS tb
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL
      WHERE p.operating_company_id = $1::uuid`, [CO]))[0].tb;
  t.ok("trial balance 0", Number(tb) === 0, String(tb));
}

// S4-bank / S6 (Cursor) land in this file under their own functions.
async function pending(name, seat) {
  step(name).ok(`owned by ${seat} — not yet written`, false);
}

try {
  if (runs("S1")) await s1();
  if (runs("S2")) await s2();
  if (runs("S3")) await s3();
  if (runs("S4")) await s4feed();
  if (runs("S4-bank")) await pending("S4-bank", "Cursor");
  if (runs("S5")) await s5();
  if (runs("S6")) await pending("S6", "Cursor");
  if (runs("S7")) await s7();
} finally {
  await app.close();
  await db.end();
}
let failed = 0;
console.log("\nlive-load-lifecycle — asserts per step:");
for (const s of results) {
  const bad = s.asserts.filter((a) => !a.ok).length;
  failed += bad;
  console.log(`  ${s.name}: ${s.asserts.length - bad}/${s.asserts.length}${bad ? `  (${bad} FAIL)` : ""}`);
}
console.log(failed ? `live-load-lifecycle: FAIL — ${failed} assert(s)` : "live-load-lifecycle: PASS");
process.exit(failed ? 1 : 0);
