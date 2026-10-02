/**
 * ROUND 330.7 order 2 — overlapping-run proof, batch B: the CC-3 lane's previously UNSWEPT scheduled engines (20), after
 * the batch B fixes. Same method as batch A: node-cron.schedule AND setInterval are intercepted before each module loads,
 * so the harness holds the engine's REAL scheduled callback (wrapper and all); it is fired TWICE AT ONCE against a
 * THROWAWAY fork, then once more on its own. Outbound calls go through a counting fetch stub. Fork-only setup gives an
 * engine fresh work where its input would otherwise be empty (named per row).
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
const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";

const calls: Array<{ method: string; path: string }> = [];
(globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = new URL(typeof input === "string" ? input : String((input as { url?: string }).url ?? input));
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, path: url.pathname });
  const body = method === "GET" ? { data: [], pagination: { endCursor: "", hasNextPage: false } } : { data: {} };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const callsTo = (re: RegExp) => calls.filter((c) => re.test(c.path)).length;

// ---- capture node-cron and setInterval callbacks instead of scheduling them ----
const cronMod = (await import("node-cron")).default as { schedule: (...a: unknown[]) => unknown };
type Cb = { expr: string; fn: () => Promise<unknown> };
const captured: Cb[] = [];
cronMod.schedule = (expr: unknown, fn: unknown) => { captured.push({ expr: String(expr), fn: fn as () => Promise<unknown> }); return { stop() {}, start() {} }; };
const realSetInterval = globalThis.setInterval;
(globalThis as any).setInterval = (fn: () => unknown, ms: number) => { captured.push({ expr: `interval:${ms}`, fn: async () => fn() }); return realSetInterval(() => {}, 1 << 30); };
const logs: string[] = [];
const app = { log: { info() {}, warn() {}, error: (o: unknown, m?: string) => logs.push(`ERROR ${m ?? ""} ${JSON.stringify(o)?.slice(0, 300)}`), debug() {} } };
const capture = async (init: (a: never) => unknown, settleMs = 6000) => {
  const start = captured.length;
  await init(app as never);
  await new Promise((r) => setTimeout(r, settleMs)); // the boot-time run of a setInterval worker finishes before "before"
  return captured.slice(start);
};

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const pgMod = (await import("pg")).default;
const ownerExec = async (sql: string, v: unknown[] = []) => { const c = new pgMod.Client({ connectionString: FORK }); await c.connect(); try { await c.query("BEGIN"); await c.query("RESET ROLE"); const r = (await c.query(sql, v)).rowCount; await c.query("COMMIT"); return r; } finally { await c.end(); } };
const one = async <T = any>(sql: string, v: unknown[] = []): Promise<T> => withLuciaBypass(async (c: any) => (await c.query(sql, v)).rows[0] as T);
const n = async (sql: string, v: unknown[] = []) => Number((await one<{ n: string }>(sql, v))?.n ?? 0);
const exists = async (rel: string) => Boolean((await one<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL ok`, [rel]))?.ok);
const countIf = async (rel: string, where = "true", v: unknown[] = []) => ((await exists(rel)) ? n(`SELECT count(*) n FROM ${rel} WHERE ${where}`, v) : "no table");

const ONLY = (process.env.OVL_ONLY ?? "").split(",").filter(Boolean);
const results: Record<string, unknown> = {};
async function prove(name: string, o: { setup?: () => Promise<unknown>; lateSetup?: boolean; init: () => Promise<Cb[]>; pick?: (c: Cb[]) => Cb; count: () => Promise<Record<string, unknown>>; extra?: () => Promise<Record<string, unknown>> }) {
  if (ONLY.length && !ONLY.some((x) => name.startsWith(x))) return;
  try {
    let setup = o.setup && !o.lateSetup ? await o.setup() : undefined;
    const cbs = await o.init();
    // lateSetup: plant the work AFTER init, so a setInterval worker's boot-time run cannot take it before the pair fires
    if (o.setup && o.lateSetup) setup = await o.setup();
    const cb = o.pick ? o.pick(cbs) : cbs[0];
    if (!cb) throw new Error("no scheduled callback captured (engine disabled by env?)");
    const before = await o.count();
    const c0 = calls.length;
    // a setInterval worker's callback is "() => void run()" — it returns before the tick finishes; let it settle
    const settle = () => (cb.expr.startsWith("interval:") ? new Promise((r) => setTimeout(r, 12000)) : Promise.resolve());
    const settled = await Promise.allSettled([cb.fn(), cb.fn()]);
    await settle();
    const pair = await o.count();
    const pairCalls = calls.length - c0;
    const c1 = calls.length;
    await cb.fn();
    await settle();
    const single = await o.count();
    results[name] = { setup, before, after_two_at_once: pair, after_one_more_single_run: single, external_calls: { pair: pairCalls, single: calls.length - c1 }, rejected: settled.filter((s) => s.status === "rejected").length, ...(o.extra ? await o.extra() : {}) };
  } catch (e) { results[name] = { ERROR: (e as Error).message }; }
  console.log(name, JSON.stringify(results[name]));
}
const imp = (p: string) => import(`../../apps/backend/src/${p}`);

await prove("B01_real_driven_miles_segments", {
  setup: async () => ({ removed: await ownerExec(`DELETE FROM telematics.load_odometer_segments WHERE id IN (SELECT id FROM telematics.load_odometer_segments WHERE operating_company_id = $1 ORDER BY created_at DESC LIMIT 3)`, [OC]) }),
  init: async () => capture((await imp("cron/real-driven-miles-segments.cron.js")).initializeRealDrivenMilesSegmentsCron, 2500),
  count: async () => ({ segments: await countIf("telematics.load_odometer_segments", "operating_company_id = $1", [OC]) }),
  extra: async () => ({ duplicate_keys: await n(`SELECT count(*) n FROM (SELECT 1 FROM telematics.load_odometer_segments GROUP BY operating_company_id, load_id, unit_id, segment_kind, started_at HAVING count(*) > 1) d`) }),
});

await prove("B02_reefer_hours_poll", {
  init: async () => capture((await imp("cron/reefer-hours-poll.cron.js")).initializeReeferHoursPollCron, 2500),
  count: async () => ({ hours_log: await countIf("maintenance.reefer_hours_log"), specs: await countIf("maintenance.reefer_specs"), ingest_audits: await n(`SELECT count(*) n FROM audit.audit_events WHERE event_class = 'cron_reefer_hours_ingested'`) }),
});

await prove("B03_samsara_health", {
  init: async () => capture((await imp("cron/samsara-health-cron.js")).initializeSamsaraHealthCheckCron, 2500),
  count: async () => ({ samsara_calls_total: calls.length, health_audits: await n(`SELECT count(*) n FROM audit.audit_events WHERE event_class ILIKE '%samsara%health%'`) }),
});

// B04 positions cron — the two fixed writes it reaches, each from two sessions at once:
//  (a) fence transitions: the location fix and the stats fix for the same arrival, 3 s apart, processed concurrently
//  (b) HOS clocks pull: two concurrent pulls for the company
await prove("B04a_fence_transition_twin_fixes", {
  setup: async () => {
    const g = await one<any>(`SELECT g.id::text, g.center_lat::float8 lat, g.center_lng::float8 lng FROM geo.geofences g WHERE g.operating_company_id = $1 AND g.is_active AND g.center_lat IS NOT NULL AND g.location_kind = 'custom' ORDER BY g.created_at DESC LIMIT 1`, [OC]);
    const u = await one<any>(`SELECT u.id::text FROM mdata.units u WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1 AND u.deactivated_at IS NULL ORDER BY u.unit_number LIMIT 1`, [OC]);
    (globalThis as any).__b4 = { g, u, t: new Date(Date.now() - 30 * 60_000) };
    return { fence: g.id, unit: u.id };
  },
  init: async () => {
    const { processGeofenceDetectionsForGpsPoint } = await imp("telematics/geofence-detector.service.js");
    const { g, u, t } = (globalThis as any).__b4;
    let k = 0;
    return [{ expr: "direct", fn: () => { const at = new Date(t.getTime() + (k++ % 2) * 3000).toISOString(); return withLuciaBypass(async (c: any) => { await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]); return processGeofenceDetectionsForGpsPoint(c, { operating_company_id: OC, unit_id: u.id, latitude: g.lat, longitude: g.lng, occurred_at: at, source: "samsara_gps" }, { suppressOperationalSideEffects: true }); }); } }];
  },
  count: async () => { const { g, u } = (globalThis as any).__b4; return { entered_events_for_pair: await n(`SELECT count(*) n FROM geo.geofence_events WHERE geofence_id = $1 AND unit_id = $2 AND event_kind = 'entered' AND occurred_at > now() - interval '40 minutes'`, [g.id, u.id]) }; },
});

await prove("B04b_hos_clocks_pull", {
  init: async () => {
    const { syncSamsaraHosClocks } = await imp("integrations/samsara/samsara-hos-clocks-pull.service.js");
    return [{ expr: "direct", fn: () => withLuciaBypass(async (c: any) => { await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]); const r = await syncSamsaraHosClocks(c, OC); await new Promise((res) => setTimeout(res, 400)); return r; }) }];
  },
  count: async () => ({ samsara_clock_calls: callsTo(/\/fleet\/hos\/clocks/), snapshots: await countIf("samsara.hos_snapshots", "operating_company_id = $1", [OC]) }),
});

await prove("B05_google_reference_miles_expiry", {
  setup: async () => ({ aged: await ownerExec(`UPDATE mdata.load_stop_legs SET google_reference_fetched_at = now() - interval '40 days' WHERE ctid IN (SELECT ctid FROM mdata.load_stop_legs WHERE operating_company_id = $1 AND google_reference_fetched_at IS NOT NULL LIMIT 3)`, [OC]) }),
  init: async () => capture((await imp("cron/google-reference-miles-expiry-cron.js")).initializeGoogleReferenceMilesExpiryCron, 1500),
  count: async () => ({ stale_left: await n(`SELECT count(*) n FROM mdata.load_stop_legs WHERE operating_company_id = $1 AND google_reference_fetched_at < now() - interval '30 days'`, [OC]) }),
});

await prove("B06_chat_confirmation_escalation", {
  setup: async () => {
    const { getOrCreateDriverDirectThread } = await imp("integrations/samsara/messaging/driver-message-inbound.service.js");
    const d = await one<any>(`SELECT a.driver_id::text FROM mdata.driver_samsara_accounts a WHERE a.is_active AND a.operating_company_id = $1 LIMIT 1`, [OC]);
    const threadId = await withLuciaBypass(async (c: any) => { await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]); return getOrCreateDriverDirectThread(c, OC, d.driver_id); });
    const { postMessage } = await imp("chat/chat.service.js");
    const msg = await withLuciaBypass(async (c: any) => { await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]); return postMessage(c, { thread_id: threadId, sender: { party_type: "system" }, msg_type: "confirmation_request", body: "overlap proof — confirm", client_key: `ovl-${randomUUID()}`, content_sha256: "0".repeat(64) }, { subject_type: "driver", subject_id: d.driver_id }); });
    const id = String((msg.message as { id: string }).id);
    await new Promise((r) => setTimeout(r, 130_000)); // chat.messages is append-only: wait out staleAfterMinutes (2)
    (globalThis as any).__b6 = id;
    return { message: id };
  },
  init: async () => capture((await imp("cron/chat-confirmation-escalation.cron.js")).initializeChatConfirmationEscalationCron, 1500),
  count: async () => ({ escalation_events: await n(`SELECT count(*) n FROM events.event_log WHERE event_type = 'chat.confirmation_escalated' AND payload->>'message_id' = $1`, [(globalThis as any).__b6]) }),
});

await prove("B08_auto_status_switch", {
  init: async () => capture((await imp("jobs/auto-status-switch-worker.js")).initializeAutoStatusSwitchWorker, 1500),
  count: async () => ({ position_snapshots_written_last_10m: await countIf("integrations.auto_status_position_snapshots", "recorded_at > now() - interval '10 minutes'"), intransit_issues: await countIf("dispatch.intransit_issues") }),
});

await prove("B09_border_crossing_projector", {
  lateSetup: true,
  setup: async () => {
    const g = await one<any>(`SELECT id::text, center_lat::float8 lat, center_lng::float8 lng FROM geo.geofences WHERE operating_company_id = $1 AND is_active AND location_kind = 'border_crossing' AND label ILIKE '%bridge%' LIMIT 1`, [OC]);
    const u = await one<any>(`SELECT u.id::text FROM mdata.units u WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1 AND u.deactivated_at IS NULL ORDER BY u.unit_number DESC LIMIT 1`, [OC]);
    if (!g) return { note: "no border fence" };
    await ownerExec(`INSERT INTO geo.geofence_events (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, point_lat, point_lng, source)
      VALUES ($1, $2, $3, 'entered', now() - interval '120 minutes', $4, $5, 'samsara_gps'), ($1, $2, $3, 'exited', now() - interval '100 minutes', $4, $5, 'samsara_gps')`, [OC, g.id, u.id, g.lat, g.lng]);
    // a fix on the US side before the visit and on the MX side after it (the projector reads the country from these)
    await ownerExec(`INSERT INTO telematics.vehicle_locations (operating_company_id, unit_id, samsara_vehicle_id, captured_at, lat, lng, raw_samsara_event_id, state, formatted_location)
      VALUES ($1, $2, 'ovl', now() - interval '120 minutes 10 seconds', 27.51, -99.50, $3, 'TX', 'Laredo, TX'), ($1, $2, 'ovl', now() - interval '99 minutes 50 seconds', 27.48, -99.51, $4, 'Tamaulipas', 'Nuevo Laredo, Tamaulipas, Mexico')`, [OC, u.id, `ovl-${randomUUID()}`, `ovl-${randomUUID()}`]);
    (globalThis as any).__b9 = { g: g.id, u: u.id };
    return { fence: g.id, unit: u.id, visit: "entered 2 h ago, exited 100 min ago" };
  },
  init: async () => capture((await imp("jobs/border-crossing-detector.js")).initializeBorderCrossingDetectorWorker, 8000),
  count: async () => ({ crossings_for_unit_last_3h: await n(`SELECT count(*) n FROM dispatch.border_crossing_events WHERE vehicle_id::text = $1 AND entered_geofence_at > now() - interval '3 hours'`, [(globalThis as any).__b9?.u ?? "none"]) }),
});

await prove("B10_geofence_state_watcher", {
  init: async () => capture((await imp("jobs/geofence-state-watcher.js")).initializeGeofenceStateWatcher, 15000),
  count: async () => ({ fence_events: await n(`SELECT count(*) n FROM geo.geofence_events WHERE operating_company_id = $1`, [OC]), state_rows: await countIf("geo.geofence_vehicle_state") }),
  extra: async () => ({ duplicate_exact_events: await n(`SELECT count(*) n FROM (SELECT 1 FROM geo.geofence_events GROUP BY operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source HAVING count(*) > 1) d`) }),
});

await prove("B11_layover_detector", {
  init: async () => capture((await imp("jobs/layover-detector-worker.js")).initializeLayoverDetectorWorker, 6000),
  count: async () => ({ layovers: await countIf("dispatch.driver_layovers") }),
});

await prove("B12_vehicle_driver_pairing", {
  init: async () => capture((await imp("jobs/vehicle-driver-pairing-worker.js")).initializeVehicleDriverPairingWorker, 1500),
  count: async () => ({ assignments: await countIf("telematics.vehicle_driver_assignments", "operating_company_id = $1", [OC]), assignment_calls: callsTo(/driver-assignments/) }),
  extra: async () => ({ duplicate_samsara_ids: await n(`SELECT count(*) n FROM (SELECT 1 FROM telematics.vehicle_driver_assignments WHERE samsara_assignment_id IS NOT NULL GROUP BY operating_company_id, samsara_assignment_id HAVING count(*) > 1) d`) }),
});

await prove("B13_active_driver_set", {
  init: async () => capture((await imp("jobs/active-driver-set-recompute.js")).initializeActiveDriverSetRecomputeWorker, 1500),
  count: async () => ({ snapshots: await countIf("integrations.active_driver_set_cache", "snapshot_at > now() - interval '10 minutes'") }),
});

await prove("B14_driver_active_30d", {
  init: async () => capture((await imp("jobs/driver-active-30d-worker.js")).initializeDriverActive30dWorker, 1500),
  count: async () => ({ inactive_drivers: await n(`SELECT count(*) n FROM mdata.drivers WHERE operating_company_id = $1 AND status = 'Inactive'`, [OC]), active_drivers: await n(`SELECT count(*) n FROM mdata.drivers WHERE operating_company_id = $1 AND status = 'Active'`, [OC]) }),
});

await prove("B16_late_arrival_aggregator", {
  init: async () => capture((await imp("jobs/late-arrival-aggregator-worker.js")).initializeLateArrivalAggregatorWorker, 6000),
  count: async () => ({ aggregates: await countIf("dispatch.late_arrival_aggregates") }),
});

await prove("B17_customer_relationship_scorer", {
  init: async () => capture((await imp("jobs/customer-relationship-scorer.js")).initializeCustomerRelationshipScorerWorker, 8000),
  count: async () => ({ scores: await countIf("master_data.customer_relationship_scores") }),
});

await prove("B18_roster_integrity", {
  init: async () => capture((await imp("fleet/roster-integrity.cron.js")).initializeRosterIntegrityCron, 1500),
  count: async () => ({ open_findings: await countIf("fleet.roster_findings", "resolved_at IS NULL AND voided_at IS NULL") }),
  extra: async () => ({ duplicate_open_keys: (await exists("fleet.roster_findings")) ? await n(`SELECT count(*) n FROM (SELECT 1 FROM fleet.roster_findings WHERE resolved_at IS NULL AND voided_at IS NULL GROUP BY operating_company_id, finding_key HAVING count(*) > 1) d`) : "no table" }),
});

await prove("B19_deadhead_refresh", {
  init: async () => capture((await imp("reports/deadhead-refresh.job.js")).initializeDeadheadRefreshCron, 1500),
  count: async () => ({ rows: await countIf("reports.deadhead_cache") }),
});

await prove("B20_lane_profitability_refresh", {
  init: async () => capture((await imp("reports/lane-profitability-refresh.job.js")).initializeLaneProfitabilityRefreshCron, 1500),
  count: async () => ({ rows: await countIf("reports.lane_profitability_cache") }),
});

console.log("\nEXTERNAL CALLS (all stubbed):", JSON.stringify(calls.reduce((m: Record<string, number>, c) => { const k = `${c.method} ${c.path}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log("ENGINE ERROR LOGS:", JSON.stringify(logs.slice(0, 25)));
process.exit(0);
