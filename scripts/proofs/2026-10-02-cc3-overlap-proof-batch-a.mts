/**
 * ROUND 330.7 order 2 — overlapping-run proof, batch A: the 13 CC-3 scheduled engines that were already clean
 * (header-only in #24219). Same shape as #24230, one step closer to production: each engine's REAL scheduled callback is
 * captured from node-cron (cron.schedule is intercepted before the cron module loads), and that exact callback —
 * wrapBackgroundJobTick and all — is fired TWICE AT ONCE against a THROWAWAY fork, then once more on its own.
 * Every outbound call goes through a counting fetch stub (nothing leaves the machine); Samsara-fed engines get a
 * crafted payload so the tick has fresh work. Fork-only setup gives the DB-fed engines fresh work too.
 *
 * Run (from apps/backend): OVL_FORK_URL_FILE=<fork pooled url file> OVL_PROD_URL_FILE=<prod url file> npx tsx <this>
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const FORK = readFileSync(process.env.OVL_FORK_URL_FILE ?? "", "utf8").trim();
const PROD = process.env.OVL_PROD_URL_FILE ? readFileSync(process.env.OVL_PROD_URL_FILE, "utf8").trim() : "";
if (!FORK || !PROD || FORK === PROD || new URL(FORK).host === new URL(PROD).host) throw new Error("refusing: needs a throwaway fork URL distinct from production");
process.env.DATABASE_URL = FORK;
process.env.DATABASE_DIRECT_URL = FORK;
process.env.NODE_ENV = "production";
process.env.SAMSARA_API_TOKEN = "stub-token-fetch-is-stubbed";
process.env.AUTO_DELIVERY_FROM_GEOFENCE_APPLY = "true";
process.env.LOAD_STOP_RETRO_STAMP_ENABLED = "true"; // the stamp path under test
process.env.ENABLE_SAMSARA_MASTER_SYNC_CRON = "true"; // flag-off on prod; on for the proof (stubbed lists)
const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NOW = new Date();
const iso = (ms: number) => new Date(ms).toISOString();

// ---- fetch stub: routed by path; unknown paths get an empty Samsara page ----
const calls: Array<{ method: string; path: string }> = [];
const routes: Array<[RegExp, (url: URL) => unknown]> = [];
(globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = new URL(typeof input === "string" ? input : String((input as { url?: string }).url ?? input));
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, path: url.pathname });
  const hit = routes.find(([re]) => re.test(url.pathname));
  const body = hit ? hit[1](url) : method === "GET" ? { data: [], pagination: { endCursor: "", hasNextPage: false } } : { data: {} };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ---- node-cron intercept: capture every scheduled callback instead of scheduling it ----
const cronMod = (await import("node-cron")).default as { schedule: (...a: unknown[]) => unknown };
const captured: Array<{ expr: string; fn: () => Promise<unknown> }> = [];
cronMod.schedule = (expr: unknown, fn: unknown) => { captured.push({ expr: String(expr), fn: fn as () => Promise<unknown> }); return { stop() {}, start() {} }; };
const logs: string[] = [];
const app = { log: { info: (_o: unknown, m?: string) => { if (m) logs.push(m); }, warn() {}, error: (o: unknown, m?: string) => logs.push(`ERROR ${m ?? ""} ${JSON.stringify(o)?.slice(0, 300)}`), debug() {} } };
const capture = async (init: (a: never) => unknown) => {
  const start = captured.length;
  await init(app as never);
  await new Promise((r) => setTimeout(r, 2500)); // let any boot-time tick finish before "before" is read
  return captured.slice(start);
};

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const one = async <T = any>(sql: string, v: unknown[] = []): Promise<T> => withLuciaBypass(async (c: any) => (await c.query(sql, v)).rows[0] as T);
const exec = async (sql: string, v: unknown[] = []) => withLuciaBypass(async (c: any) => { await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]); return (await c.query(sql, v)).rowCount; });
const pgMod = (await import("pg")).default;
// fork-only setup as the database owner (the login defaults to the app role; RESET ROLE returns to the owner)
const ownerExec = async (sql: string, v: unknown[] = []) => { const c = new pgMod.Client({ connectionString: FORK }); await c.connect(); try { await c.query("BEGIN"); await c.query("RESET ROLE"); const r = (await c.query(sql, v)).rowCount; await c.query("COMMIT"); return r; } finally { await c.end(); } };
const n = async (sql: string, v: unknown[] = []) => Number((await one<{ n: string }>(sql, v))?.n ?? 0);
const auditN = (cls: string) => n(`SELECT count(*) n FROM audit.audit_events WHERE event_class = $1`, [cls]);

const ONLY = (process.env.OVL_ONLY ?? "").split(",").filter(Boolean);
const results: Record<string, unknown> = {};
async function prove(name: string, opts: {
  setup?: () => Promise<unknown>;
  init: () => Promise<Array<{ expr: string; fn: () => Promise<unknown> }>>;
  pick?: (cbs: Array<{ expr: string; fn: () => Promise<unknown> }>) => () => Promise<unknown>;
  count: () => Promise<Record<string, unknown>>;
  extra?: () => Promise<Record<string, unknown>>;
}) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
  try {
    const setup = opts.setup ? await opts.setup() : undefined;
    const cbs = await opts.init();
    const fire = opts.pick ? opts.pick(cbs) : cbs[0]!.fn;
    const before = await opts.count();
    const callsBefore = calls.length;
    const settled = await Promise.allSettled([fire(), fire()]);
    const afterPair = await opts.count();
    const callsPair = calls.length - callsBefore;
    await fire();
    const afterSingle = await opts.count();
    results[name] = {
      setup, before, after_two_at_once: afterPair, after_one_more_single_run: afterSingle,
      external_calls_by_the_pair: callsPair, rejected: settled.filter((s) => s.status === "rejected").map((s: any) => String(s.reason?.message ?? s.reason)),
      ...(opts.extra ? await opts.extra() : {}),
    };
  } catch (e) { results[name] = { ERROR: (e as Error).message }; }
  console.log(name, JSON.stringify(results[name]));
}

// mapped Samsara ids on the fork (the engines' own mapping functions)
const { loadUnitIdBySamsaraVehicleId } = await import("../../apps/backend/src/integrations/samsara/samsara-positions.service.js");
const { loadDriverIdBySamsaraId } = await import("../../apps/backend/src/integrations/samsara/driver-samsara-map.js");
const vehicleMap: Map<string, string> = await withLuciaBypass((c: any) => loadUnitIdBySamsaraVehicleId(c, OC));
const driverMap: Map<string, string> = await withLuciaBypass((c: any) => loadDriverIdBySamsaraId(c, OC));
const [SVID, UNIT] = [...vehicleMap.entries()][0]!;
const [SDID, DRIVER] = [...driverMap.entries()][0]!;
const RUN = randomUUID().slice(0, 8);

// A1 geofence auto-delivery (fork: one in-transit load's final delivery departed by geofence)
await prove("A01_geofence_auto_delivery", {
  setup: async () => {
    const l = await one<any>(`SELECT l.id::text, l.load_number, l.status::text FROM mdata.loads l
       WHERE l.operating_company_id = $1 AND l.status::text IN ('delivered','invoiced','closed') AND l.assigned_unit_id IS NOT NULL AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
         AND COALESCE(l.is_sample_data,false) = false
         AND EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.load_id = l.id AND s.stop_type::text = 'delivery' AND s.soft_deleted_at IS NULL)
         AND EXISTS (SELECT 1 FROM mdata.load_stops p WHERE p.load_id = l.id AND p.stop_type::text = 'pickup' AND p.soft_deleted_at IS NULL)
       ORDER BY l.created_at DESC LIMIT 1`, [OC]);
    await ownerExec(`UPDATE mdata.load_stops SET actual_departure_at = COALESCE(actual_departure_at, now() - interval '6 hours') WHERE load_id = $1 AND stop_type::text = 'pickup'`, [l.id]);
    await ownerExec(`UPDATE mdata.loads SET status = 'in_transit' WHERE id = $1`, [l.id]); // fork: back to in transit
    await ownerExec(`UPDATE mdata.load_stops SET actual_arrival_at = COALESCE(actual_arrival_at, now() - interval '2 hours'), actual_departure_at = now() - interval '1 hour', actual_arrival_source = 'eld_geofence'
       WHERE id = (SELECT id FROM mdata.load_stops WHERE load_id = $1 AND stop_type::text = 'delivery' AND soft_deleted_at IS NULL ORDER BY sequence_number DESC LIMIT 1)`, [l.id]);
    (globalThis as any).__a1 = l.id;
    return { load: l.load_number, status_before: l.status };
  },
  init: async () => capture((await import("../../apps/backend/src/cron/geofence-auto-delivery.cron.js")).initializeGeofenceAutoDeliveryCron),
  count: async () => ({
    status: (await one<any>(`SELECT status::text s FROM mdata.loads WHERE id = $1`, [(globalThis as any).__a1]))?.s,
    transition_audits_by_class: (await withLuciaBypass(async (c: any) => (await c.query(`SELECT event_class, count(*)::int n FROM audit.audit_events
        WHERE created_at > now() - interval '30 minutes' AND payload::text LIKE '%' || $1 || '%' GROUP BY 1 ORDER BY 1`, [(globalThis as any).__a1])).rows)),
  }),
});

// A2 geofence odometer captures (fork: the 5 newest captures removed so the tick has events to capture)
await prove("A02_geofence_odometer_captures", {
  setup: async () => ({ removed: await ownerExec(`DELETE FROM telematics.geofence_odometer_captures WHERE id IN (SELECT id FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1 ORDER BY created_at DESC LIMIT 5)`, [OC]) }),
  init: async () => capture((await import("../../apps/backend/src/cron/geofence-odometer-captures.cron.js")).initializeGeofenceOdometerCapturesCron),
  count: async () => ({ captures: await n(`SELECT count(*) n FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1`, [OC]) }),
  extra: async () => ({ duplicate_event_keys: await n(`SELECT count(*) n FROM (SELECT geofence_event_id FROM telematics.geofence_odometer_captures GROUP BY 1 HAVING count(*) > 1) d`) }),
});

// A3 load-stop geofence sync, whole tick (fork: 3 geofence-stamped arrivals cleared so the tick re-stamps them)
await prove("A03_load_stop_geofence_sync", {
  setup: async () => {
    // fork-only: two unstamped stops on an active load-stop fence get a real-shaped visit (entered 3 h ago, exited 1 h
    // ago, the load's own unit) — fresh work for the stamp, which the tick must apply exactly once
    const stops = (await withLuciaBypass(async (c: any) => (await c.query(`SELECT ls.id::text stop_id, l.assigned_unit_id::text unit_id, g.id::text fence_id,
          COALESCE(g.center_lat, 27.5)::float8 lat, COALESCE(g.center_lng, -99.5)::float8 lng
        FROM mdata.load_stops ls JOIN mdata.loads l ON l.id = ls.load_id
        JOIN geo.geofences g ON g.operating_company_id = l.operating_company_id AND g.is_active AND g.label = 'load-' || l.id::text || '-stop-' || ls.sequence_number::text
        WHERE l.operating_company_id = $1 AND ls.actual_arrival_at IS NULL AND l.assigned_unit_id IS NOT NULL AND l.soft_deleted_at IS NULL AND ls.soft_deleted_at IS NULL
          AND COALESCE(l.is_sample_data, false) = false
        LIMIT 2`, [OC])).rows)) as Array<{ stop_id: string; unit_id: string; fence_id: string; lat: number; lng: number }>;
    for (const st of stops) {
      await ownerExec(`INSERT INTO geo.geofence_events (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, point_lat, point_lng, source)
        VALUES ($1, $2, $3, 'entered', now() - interval '3 hours', $4, $5, 'samsara_gps'), ($1, $2, $3, 'exited', now() - interval '1 hour', $4, $5, 'samsara_gps')`, [OC, st.fence_id, st.unit_id, st.lat, st.lng]);
    }
    const ids = stops.map((x) => x.stop_id);
    (globalThis as any).__a3 = ids;
    return { stops_given_a_visit: ids.length };
  },
  init: async () => capture((await import("../../apps/backend/src/cron/load-stop-geofence-sync.cron.js")).initializeLoadStopGeofenceSyncCron),
  count: async () => ({
    stamped_of_visited: await n(`SELECT count(*) n FROM mdata.load_stops WHERE id = ANY($1::uuid[]) AND actual_arrival_at IS NOT NULL`, [(globalThis as any).__a3]),
    active_fences: await n(`SELECT count(*) n FROM geo.geofences WHERE operating_company_id = $1 AND is_active`, [OC]),
    fence_events: await n(`SELECT count(*) n FROM geo.geofence_events WHERE operating_company_id = $1`, [OC]),
  }),
  extra: async () => ({ duplicate_active_stop_fences: await n(`SELECT count(*) n FROM (SELECT label FROM geo.geofences WHERE operating_company_id = $1 AND is_active AND location_kind = 'load_stop' GROUP BY label HAVING count(*) > 1) d`, [OC]) }),
});

// A4 Samsara fuel reports (stub: one fresh driver report + one fresh vehicle report)
routes.push([/\/fleet\/reports\/drivers\/fuel-energy$/, () => ({ data: { driverReports: [{ driver: { id: `ovl-d-${RUN}`, name: "Overlap Driver" }, efficiencyMpge: 6.2, fuelConsumedMl: 100000, distanceTraveledMeters: 250000, engineRunTimeDurationMs: 3600000, engineIdleTimeDurationMs: 60000 }] }, pagination: { hasNextPage: false } })]);
routes.push([/\/fleet\/reports\/vehicles\/fuel-energy$/, () => ({ data: { vehicleReports: [{ vehicle: { id: `ovl-v-${RUN}`, name: "Overlap Unit" }, efficiencyMpge: 6.0, fuelConsumedMl: 120000, distanceTraveledMeters: 260000, engineRunTimeDurationMs: 3600000, engineIdleTimeDurationMs: 60000 }] }, pagination: { hasNextPage: false } })]);
await prove("A04_samsara_fuel_reports", {
  init: async () => capture((await import("../../apps/backend/src/cron/samsara-fuel-reports.cron.js")).initializeSamsaraFuelReportsCron),
  pick: (cbs) => cbs[0]!.fn,
  count: async () => ({ rows_for_stub_subjects: await n(`SELECT count(*) n FROM integrations.samsara_fuel_reports WHERE samsara_subject_id IN ($1, $2)`, [`ovl-d-${RUN}`, `ovl-v-${RUN}`]) }),
});

// A5 Samsara HOS pull (stub: one fresh duty-status log for a mapped driver)
const hosStart = iso(NOW.getTime() - 50 * 60_000);
const hosAsked: string[] = [];
routes.push([/\/fleet\/hos\/logs$/, (u) => { const sid = (u.searchParams.get("driverIds") ?? SDID).split(",")[0]!; hosAsked.push(sid); return ({ data: [{ driver: { id: sid }, hosLogs: [{ logStartTime: hosStart, logEndTime: iso(NOW.getTime() - 20 * 60_000), hosStatusType: "driving" }] }], pagination: { hasNextPage: false } }); }]);
await prove("A05_samsara_hos_pull", {
  setup: async () => ({ claims_backdated: await ownerExec(`UPDATE integrations.integration_sync_log SET started_at = started_at - interval '2 hours' WHERE sync_kind = 'samsara_hos_pull' AND started_at > now() - interval '45 minutes'`) }),
  init: async () => capture((await import("../../apps/backend/src/cron/samsara-hos-pull.cron.js")).initializeSamsaraHosPullCron),
  count: async () => ({ duty_events_at_stub_start: await n(`SELECT count(*) n FROM hos.duty_status_events WHERE operating_company_id = $1 AND started_at = $2::timestamptz`, [OC, hosStart]), samsara_hos_calls: hosAsked.length }),
});

// A6 Samsara master sync (advisory try-lock; stub lists are empty — the proof is how many ticks got past the lock)
await prove("A06_samsara_master_sync", {
  init: async () => capture((await import("../../apps/backend/src/cron/samsara-master-sync.cron.js")).initializeSamsaraMasterSyncCron),
  count: async () => ({
    samsara_list_calls_cumulative: calls.filter((c) => /^\/fleet\/(drivers|vehicles|trailers)/.test(c.path) || c.path === "/addresses").length,
  }),
});

// A7 telematics preservation (fresh work: everything observed since the 03:10 run)
await prove("A07_telematics_preservation", {
  init: async () => capture((await import("../../apps/backend/src/cron/telematics-preservation.cron.js")).initializeTelematicsPreservationCron),
  count: async () => {
    const tables = (await withLuciaBypass(async (c: any) => (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'preserve' AND table_type = 'BASE TABLE' ORDER BY 1`)).rows.map((r: any) => r.table_name))) as string[];
    const out: Record<string, number> = {};
    for (const t of tables) out[t] = await n(`SELECT count(*) n FROM preserve."${t}"`);
    return out;
  },
});

// A8 unit stop events (every-15-min tick; fresh work: positions since the last prod tick)
await prove("A08_unit_stop_events", {
  init: async () => capture((await import("../../apps/backend/src/cron/unit-stop-events.cron.js")).initializeUnitStopEventsCron),
  pick: (cbs) => cbs.find((c) => c.expr.startsWith("7,22"))!.fn,
  count: async () => ({ stop_events: await n(`SELECT count(*) n FROM telematics.unit_stop_events WHERE operating_company_id = $1`, [OC]) }),
  extra: async () => ({ newest_rows: (await withLuciaBypass(async (c: any) => (await c.query(`SELECT unit_id::text, started_at::text, ended_at::text, created_at::text FROM telematics.unit_stop_events WHERE operating_company_id = $1 ORDER BY created_at DESC LIMIT 10`, [OC])).rows)), duplicate_unit_start_keys: await n(`SELECT count(*) n FROM (SELECT unit_id, started_at FROM telematics.unit_stop_events GROUP BY 1, 2 HAVING count(*) > 1) d`) }),
});

// A9 Samsara DVIR poll (stub: one fresh DVIR on a mapped vehicle)
const dvirId = `ovl-dvir-${RUN}`;
routes.push([/\/fleet\/dvirs\/history$/, () => ({ data: [{ id: dvirId, type: "preTrip", safetyStatus: "safe", authorSignature: { signatoryUser: { id: SDID, name: "Overlap" }, signedAtTime: iso(NOW.getTime() - 30 * 60_000), type: "driver" }, startTime: iso(NOW.getTime() - 40 * 60_000), endTime: iso(NOW.getTime() - 30 * 60_000), odometerMeters: 1609344, location: "Laredo, TX", vehicle: { id: SVID, name: "Unit" }, vehicleDefects: [], trailerDefects: [] }], pagination: { hasNextPage: false } })]);
await prove("A09_samsara_dvir_poll", {
  init: async () => capture((await import("../../apps/backend/src/safety/samsara-dvir-poll.cron.js")).initializeSamsaraDvirPollCron),
  pick: (cbs) => cbs.find((c) => c.expr.startsWith("*/15"))!.fn,
  count: async () => ({ dvir_rows_for_stub: await n(`SELECT count(*) n FROM safety.dvir_submissions WHERE client_request_id LIKE $1`, [`%${dvirId}%`]) }),
});

// A10 odometer snapshot (fork: today's samsara readings removed so the tick re-snapshots every unit)
await prove("A10_odometer_snapshot", {
  setup: async () => ({ removed_today: await ownerExec(`DELETE FROM telematics.odometer_readings WHERE operating_company_id = $1 AND source = 'samsara' AND telematics.odometer_reading_day(read_at) = telematics.odometer_reading_day(now())`, [OC]) }),
  init: async () => capture((await import("../../apps/backend/src/telematics/odometer-snapshot.cron.js")).initializeOdometerSnapshotCron),
  count: async () => ({ todays_samsara_readings: await n(`SELECT count(*) n FROM telematics.odometer_readings WHERE operating_company_id = $1 AND source = 'samsara' AND telematics.odometer_reading_day(read_at) = telematics.odometer_reading_day(now())`, [OC]) }),
  extra: async () => ({ duplicate_unit_day_keys: await n(`SELECT count(*) n FROM (SELECT unit_id, telematics.odometer_reading_day(read_at) FROM telematics.odometer_readings WHERE source = 'samsara' AND read_at >= '2026-09-30' GROUP BY 1, 2 HAVING count(*) > 1) d`) }),
});

// A11 draft-crew status self-heal (fork: one crewed assigned load set back to draft)
await prove("A11_draft_crew_status_selfheal", {
  setup: async () => {
    const l = await one<any>(`SELECT id::text, load_number, status::text FROM mdata.loads WHERE operating_company_id = $1 AND assigned_primary_driver_id IS NOT NULL AND soft_deleted_at IS NULL AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`, [OC]);
    await ownerExec(`UPDATE mdata.loads SET status = 'draft' WHERE id = $1`, [l.id]);
    (globalThis as any).__a11 = l.id;
    return { load: l.load_number };
  },
  init: async () => capture((await import("../../apps/backend/src/cron/draft-crew-status-selfheal.cron.js")).initializeDraftCrewStatusSelfHealCron),
  count: async () => ({
    status: (await one<any>(`SELECT status::text s FROM mdata.loads WHERE id = $1`, [(globalThis as any).__a11]))?.s,
    selfheal_audits_for_load: await n(`SELECT count(*) n FROM audit.audit_events WHERE payload::text LIKE $1 AND event_class ILIKE '%draft%'`, [`%${(globalThis as any).__a11}%`]),
  }),
});

// A12 load real driven miles (fork: computed miles cleared on 5 delivered loads)
await prove("A12_load_real_driven_miles", {
  setup: async () => {
    const ids = (await withLuciaBypass(async (c: any) => (await c.query(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1 AND miles_driven_actual_computed_at IS NOT NULL ORDER BY created_at DESC LIMIT 5`, [OC])).rows.map((r: any) => r.id))) as string[];
    const was = (await withLuciaBypass(async (c: any) => (await c.query(`SELECT id::text, miles_driven_actual::text m FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY id`, [ids])).rows)) as Array<{ id: string; m: string }>;
    await ownerExec(`UPDATE mdata.loads SET miles_driven_actual = NULL, miles_driven_actual_computed_at = NULL WHERE id = ANY($1::uuid[])`, [ids]);
    (globalThis as any).__a12 = { ids, was };
    return { cleared_loads: ids.length, computed_after_clear: await n(`SELECT count(*) n FROM mdata.loads WHERE id = ANY($1::uuid[]) AND miles_driven_actual_computed_at IS NOT NULL`, [ids]) };
  },
  init: async () => capture((await import("../../apps/backend/src/telematics/load-real-driven-miles.cron.js")).initializeLoadRealDrivenMilesCron),
  count: async () => ({ recomputed_of_cleared: await n(`SELECT count(*) n FROM mdata.loads WHERE id = ANY($1::uuid[]) AND miles_driven_actual_computed_at IS NOT NULL`, [(globalThis as any).__a12.ids]) }),
  extra: async () => {
    const now = (await withLuciaBypass(async (c: any) => (await c.query(`SELECT id::text, miles_driven_actual::text m FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY id`, [(globalThis as any).__a12.ids])).rows)) as Array<{ id: string; m: string }>;
    const was = (globalThis as any).__a12.was as Array<{ id: string; m: string }>;
    return { values_identical_to_before_clear: now.every((r, i) => r.m === was[i]!.m) };
  },
});

// A13 harsh-events poll (stub: one fresh harsh-brake event on a mapped vehicle)
const harshId = `ovl-harsh-${RUN}`;
routes.push([/\/fleet\/safety-events$/, () => ({ data: [{ id: harshId, time: iso(NOW.getTime() - 3 * 3600_000), vehicle: { id: SVID }, behaviorLabels: [{ label: "harshBrake" }], maxAccelerationGForce: 0.5, location: { latitude: 27.5, longitude: -99.5 } }], pagination: { hasNextPage: false } })]);
await prove("A13_harsh_events_poll", {
  init: async () => capture((await import("../../apps/backend/src/safety/harsh-events-poll.cron.js")).initializeHarshEventsPollCron),
  count: async () => ({ harsh_rows_for_stub: await n(`SELECT count(*) n FROM safety.harsh_events WHERE raw_samsara_id = $1`, [harshId]) }),
});

console.log("\nEXTERNAL CALLS (all stubbed):", JSON.stringify(calls.reduce((m: Record<string, number>, c) => { const k = `${c.method} ${c.path}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log("ENGINE ERROR LOGS:", JSON.stringify(logs.filter((l) => l.startsWith("ERROR")).slice(0, 20)));
process.exit(0);
