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
const app = await createIntegrationApp(async (a) => {
  await registerDispatchLoadRoutes(a);
  await registerMilesRecommendationsRoutes(a);
  await registerGeocodingRoutes(a);
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

// S2 / S5 / S7 (CC-3) and S4-bank / S6 (Cursor) land in this file under their own functions.
async function pending(name, seat) {
  step(name).ok(`owned by ${seat} — not yet written`, false);
}

try {
  if (runs("S1")) await s1();
  if (runs("S2")) await pending("S2", "CC-3");
  if (runs("S3")) await s3();
  if (runs("S4")) await s4feed();
  if (runs("S4-bank")) await pending("S4-bank", "Cursor");
  if (runs("S5")) await pending("S5", "CC-3");
  if (runs("S6")) await pending("S6", "Cursor");
  if (runs("S7")) await pending("S7", "CC-3");
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
