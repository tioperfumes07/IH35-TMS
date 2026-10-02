/**
 * ROUND 330.1 — overlapping-run proof for the 12 ROUND 329 engines, on a THROWAWAY Neon fork only.
 * Each engine is driven from TWO CONCURRENT sessions (two pooled connections, two transactions, the app's own
 * withLuciaBypass wrapper and ih35_app role) against the fork; row counts before and after are printed.
 * Every outbound call goes through a global fetch stub — nothing leaves this machine; the stub counts calls so a
 * duplicated external call shows up as a number.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Run: OVL_FORK_URL_FILE=<file holding a THROWAWAY fork's pooled URL> OVL_PROD_URL_FILE=<prod url file> npx tsx <this>
// (from apps/backend). Refuses to run against the production URL. Fork used 2026-10-02: br-rough-night-ak507ejk
// (parent br-fancy-credit-akjnd07a), deleted after the run.
const FORK = readFileSync(process.env.OVL_FORK_URL_FILE ?? "", "utf8").trim();
const PROD = process.env.OVL_PROD_URL_FILE ? readFileSync(process.env.OVL_PROD_URL_FILE, "utf8").trim() : "";
if (!FORK || !PROD || FORK === PROD || new URL(FORK).host === new URL(PROD).host) throw new Error("refusing: needs a throwaway fork URL distinct from production");
process.env.DATABASE_URL = FORK;
process.env.DATABASE_DIRECT_URL = FORK;
process.env.NODE_ENV = "production";
process.env.SAMSARA_FUEL_PURCHASE_PUSH_APPLY = "true";
process.env.SAMSARA_DRIVER_MESSAGING_ENABLED = "true";
process.env.SAMSARA_ROUTES_PUSH_ENABLED = "true";
process.env.SAMSARA_API_TOKEN = "stub-token-fetch-is-stubbed"; // the fork's stored tokens are encrypted; every call is stubbed anyway
const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";

// ---- fetch stub: default answer is an empty Samsara page; every call is recorded ----
const calls: Array<{ method: string; url: string }> = [];
(globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, url });
  const body = method === "GET" ? { data: [], pagination: { endCursor: "", hasNextPage: false } } : { data: { id: `stub-${randomUUID()}` } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const callsMatching = (re: RegExp, m?: string) => calls.filter((c) => re.test(c.url) && (!m || c.method === m)).length;

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
type C = { query: (s: string, v?: unknown[]) => Promise<{ rows: any[] }> };
const one = async <T = any>(sql: string, v: unknown[] = []): Promise<T> =>
  withLuciaBypass(async (c: any) => (await c.query(sql, v)).rows[0] as T);
const scoped = <T>(fn: (c: C) => Promise<T>) =>
  withLuciaBypass(async (c: any) => {
    await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]);
    return fn(c);
  });
const both = async <T>(a: () => Promise<T>, b: () => Promise<T>) => {
  const r = await Promise.allSettled([a(), b()]);
  return r.map((x) => (x.status === "fulfilled" ? x.value : `REJECTED: ${(x.reason as Error)?.message ?? x.reason}`));
};
const out: Record<string, unknown> = {};
const ONLY = (process.env.OVL_ONLY ?? "").split(",").filter(Boolean);
const run = async (name: string, fn: () => Promise<unknown>) => {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
  try { out[name] = await fn(); } catch (e) { out[name] = { ERROR: (e as Error).message }; }
  console.log(name, JSON.stringify(out[name]));
};
const auditCount = async (cls: string) => {
  return Number((await one<{ n: string }>(`SELECT count(*)::text n FROM audit.audit_events WHERE event_class = $1`, [cls])).n);
};

// 1 — fault-code-processor: same event processed by two sessions at once (the cron's twin-instance case)
await run("01_fault_code_processor", async () => {
  const { processVehicleFaultCodeWebhookEvent } = await import("../../apps/backend/src/integrations/samsara/fault-code-processor.service.js");
  const h = await one<any>(`SELECT h.id::text, h.raw_event_id::text, h.unit_id::text, h.fault_code, h.source, h.raw_payload
      FROM maintenance.samsara_fault_code_history h
     WHERE h.operating_company_id = $1 AND h.raw_event_id IS NOT NULL AND h.auto_wo_id IS NULL AND h.auto_wo_created_at IS NULL
       AND h.resolved_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM maintenance.samsara_fault_code_history x WHERE x.unit_id = h.unit_id AND x.fault_code = h.fault_code
                        AND x.id <> h.id AND x.resolved_at IS NULL AND x.occurred_at >= now() - interval '24 hours')
     ORDER BY h.occurred_at DESC LIMIT 1`, [OC]);
  // fork-only setup: this code becomes a high-severity auto-WO rule so the WO branch runs
  await withLuciaBypass(async (c: any) => {
    await c.query(`UPDATE maintenance.fault_code_severity_rules SET active = false WHERE operating_company_id = $1 AND fault_code = $2`, [OC, h.fault_code]);
    await c.query(`INSERT INTO maintenance.fault_code_severity_rules (operating_company_id, fault_code, source, description, severity, auto_create_wo, active)
                   VALUES ($1, $2, $3, 'overlap proof (fork)', 'high', true, true)`, [OC, h.fault_code, h.source]);
  });
  const event = { id: h.raw_event_id, operating_company_id: OC, event_type: "VehicleStats", samsara_event_id: null, signature_valid: true, payload: h.raw_payload, received_at: new Date().toISOString(), projection_attempts: 0 };
  const count = async () => ({
    history: Number((await one<any>(`SELECT count(*) n FROM maintenance.samsara_fault_code_history WHERE raw_event_id = $1 AND fault_code = $2`, [h.raw_event_id, h.fault_code])).n),
    work_orders: Number((await one<any>(`SELECT count(*) n FROM maintenance.work_orders WHERE origin_fault_history_id = $1`, [h.id])).n),
  });
  const before = await count();
  const results = await both(() => scoped((c) => processVehicleFaultCodeWebhookEvent(c as never, event as never, h.unit_id)), () => scoped((c) => processVehicleFaultCodeWebhookEvent(c as never, event as never, h.unit_id)));
  const afterConcurrent = await count();
  const rerun = await scoped((c) => processVehicleFaultCodeWebhookEvent(c as never, event as never, h.unit_id));
  return { fault: `${h.fault_code} history ${h.id}`, before, results, afterConcurrent, rerun, afterRerun: await count() };
});

// 2 — document-alerts: two whole ticks at once
await run("02_document_alerts", async () => {
  const { runDocumentAlertEngineCronTick } = await import("../../apps/backend/src/drivers/document-alerts.cron.js");
  // fork-only setup: every enabled rule also fires at each candidate's actual days-until-expiry, so the tick has work
  await withLuciaBypass(async (c: any) => {
    await c.query(`UPDATE safety.document_alert_rules SET days_before_expiry = ARRAY(SELECT generate_series(-30, 400)) WHERE enabled`);
  });
  const count = async () => ({
    events_notified: Number((await one<any>(`SELECT count(*) n FROM safety.document_alert_events WHERE notified_at IS NOT NULL`)).n),
    notifications: Number((await one<any>(`SELECT count(*) n FROM notifications.user_notifications WHERE source_block = 'a24-9-document-expiry'`)).n),
    outbox_emails: Number((await one<any>(`SELECT count(*) n FROM outbox.events WHERE event_type = 'driver.document_expiry_email'`)).n),
  });
  const before = await count();
  const results = await both(() => runDocumentAlertEngineCronTick(), () => runDocumentAlertEngineCronTick());
  const afterConcurrent = await count();
  await runDocumentAlertEngineCronTick();
  const afterRerun = await count();
  const dupNotifications = Number((await one<any>(`SELECT count(*) n FROM (SELECT user_id, entity_id, title FROM notifications.user_notifications
      WHERE source_block = 'a24-9-document-expiry' GROUP BY 1, 2, 3 HAVING count(*) > 1) d`)).n);
  return { before, results, afterConcurrent, afterRerun, duplicate_notification_groups: dupNotifications };
});

// 3 — samsara-documents: the same Samsara document ingested by two sessions at once
await run("03_samsara_documents", async () => {
  const { ingestSamsaraDocuments } = await import("../../apps/backend/src/integrations/samsara/documents/samsara-documents.service.js");
  const docId = `ovl-${randomUUID()}`;
  const doc = { id: docId, name: "POD", fields: [{ value: { photoValue: [{ url: "https://stub.invalid/p1.jpg" }, { url: "https://stub.invalid/p2.jpg" }] } }] };
  let puts = 0;
  const store = { put: async () => { puts += 1; } };
  const fetchPhoto = async () => ({ bytes: Buffer.from(`photo-${docId}`), mime: "image/jpeg" });
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM docs.files WHERE r2_key LIKE $1`, [`samsara/documents/${docId}/%`])).n);
  const before = await count();
  const results = await both(
    () => scoped((c) => ingestSamsaraDocuments(c as never, OC, [doc], store as never, fetchPhoto as never)),
    () => scoped((c) => ingestSamsaraDocuments(c as never, OC, [doc], store as never, fetchPhoto as never)),
  );
  return { before, results, after: await count(), r2_puts: puts };
});

// 4 — webhook projection: one pending event, two whole ticks at once
await run("04_webhook_projection", async () => {
  const { runSamsaraWebhookProjectionTick } = await import("../../apps/backend/src/cron/samsara-webhook-projection.cron.js");
  // fork-only setup: one pending driver webhook event
  const evId = await withLuciaBypass(async (c: any) => {
    await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]);
    const r = await c.query(`INSERT INTO integrations.samsara_webhook_events (operating_company_id, event_type, samsara_event_id, signature_valid, payload)
        VALUES ($1, 'DriverUpdated', $2, true, $3::jsonb) RETURNING id::text`,
      [OC, `ovl-${randomUUID()}`, JSON.stringify({ eventType: "DriverUpdated", data: { driver: { id: "ovl-999", name: "Overlap Proof" } } })]);
    return r.rows[0].id as string;
  });
  const started = () => auditCount("webhook_projection_started");
  const state = async () => (await one<any>(`SELECT projection_status, projection_attempts FROM integrations.samsara_webhook_projection_state WHERE webhook_event_id = $1`, [evId])) ?? null;
  const before = { started_audits: await started(), state: await state() };
  const results = await both(() => runSamsaraWebhookProjectionTick(), () => runSamsaraWebhookProjectionTick());
  return { event: evId, before, results, after: { started_audits: await started(), state: await state() } };
});

// 5 — fuel purchase push (APPLY on, Samsara stubbed): two whole ticks at once
await run("05_fuel_purchase_push", async () => {
  const { runFuelPurchasePushCronTick } = await import("../../apps/backend/src/integrations/samsara/fuel-purchase-push.cron.js");
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM integrations.integration_sync_log WHERE sync_kind = 'fuel_purchase_push'`)).n);
  const before = { ledger: await count(), posts: callsMatching(/fuel/i, "POST") };
  const results = await both(() => runFuelPurchasePushCronTick(), () => runFuelPurchasePushCronTick());
  const afterConcurrent = { ledger: await count(), posts: callsMatching(/fuel/i, "POST") };
  await runFuelPurchasePushCronTick();
  return { before, results, afterConcurrent, single_run_for_comparison: { ledger: await count(), posts: callsMatching(/fuel/i, "POST") } };
});

// 6 — routes push (Samsara stubbed): ledger hashes made stale on the fork so every routed load must push
await run("06_routes_push", async () => {
  const { runSamsaraRoutesPushTick } = await import("../../apps/backend/src/integrations/samsara/routes-push.cron.js");
  await withLuciaBypass(async (c: any) => {
    await c.query(`UPDATE integrations.integration_sync_log SET payload = jsonb_set(payload, '{body_hash}', '"stale-ovl"') WHERE sync_kind = 'route_push' AND payload ? 'body_hash'`);
  });
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM integrations.integration_sync_log WHERE sync_kind = 'route_push'`)).n);
  const pushes = () => callsMatching(/\/fleet\/routes/i, "POST") + callsMatching(/\/fleet\/routes/i, "PATCH");
  const before = { ledger: await count(), route_writes: pushes() };
  const results = await both(() => runSamsaraRoutesPushTick(), () => runSamsaraRoutesPushTick());
  return { before, results: results.map((r: any) => (typeof r === "string" ? r : { skipped: r.skipped, results: r.results?.length })), after: { ledger: await count(), route_writes: pushes() } };
});

// 7 — driver replies inbound: the same Samsara message from a driver with no direct thread, two sessions at once
await run("07_driver_replies_inbound", async () => {
  const { ingestDriverReplies } = await import("../../apps/backend/src/integrations/samsara/messaging/driver-message-inbound.service.js");
  const d = await one<any>(`SELECT a.driver_id::text, a.samsara_driver_id::text FROM mdata.driver_samsara_accounts a
     WHERE a.is_active AND a.operating_company_id = $1
       AND NOT EXISTS (SELECT 1 FROM chat.participants p JOIN chat.threads t ON t.id = p.thread_id WHERE t.kind = 'driver_direct' AND p.driver_id = a.driver_id)
     LIMIT 1`, [OC]);
  const sentAtMs = Date.UTC(2020, 0, 1); // no load at that time -> the driver's direct thread
  const api = { listDriverMessages: async () => [{ samsaraDriverId: d.samsara_driver_id, text: "overlap proof", sentAtMs, senderType: "driver", senderName: null }] };
  const count = async () => ({
    direct_threads: Number((await one<any>(`SELECT count(DISTINCT t.id) n FROM chat.threads t JOIN chat.participants p ON p.thread_id = t.id WHERE t.kind = 'driver_direct' AND p.driver_id = $1`, [d.driver_id])).n),
    messages: Number((await one<any>(`SELECT count(*) n FROM chat.messages WHERE client_key = $1`, [`samsara-msg:${d.samsara_driver_id}:${sentAtMs}`])).n),
  });
  const before = await count();
  const results = await both(() => scoped((c) => ingestDriverReplies(c as never, OC, api, 48, sentAtMs + 1000)), () => scoped((c) => ingestDriverReplies(c as never, OC, api, 48, sentAtMs + 1000)));
  return { driver: d.driver_id, before, results, after: await count() };
});

// 8 — driver message delivery: one office message delivered by two sessions at once (Samsara send stubbed)
await run("08_driver_message_delivery", async () => {
  const { deliverChatMessageToSamsara } = await import("../../apps/backend/src/integrations/samsara/messaging/driver-message-delivery.service.js");
  const { getOrCreateDriverDirectThread } = await import("../../apps/backend/src/integrations/samsara/messaging/driver-message-inbound.service.js");
  const d = await one<any>(`SELECT a.driver_id::text FROM mdata.driver_samsara_accounts a WHERE a.is_active AND a.operating_company_id = $1 LIMIT 1`, [OC]);
  // fork-only setup: one office text in that driver's direct thread
  const msgId = await scoped(async (c) => {
    const threadId = await getOrCreateDriverDirectThread(c as never, OC, d.driver_id);
    const { postMessage } = await import("../../apps/backend/src/chat/chat.service.js");
    const r = await postMessage(c as never, { thread_id: threadId, sender: { party_type: "system" }, msg_type: "text", body: "overlap proof", client_key: `ovl-${randomUUID()}`, content_sha256: "0".repeat(64) }, { subject_type: "driver", subject_id: d.driver_id });
    return String((r.message as { id: string }).id);
  });
  let sends = 0;
  const sender = { sendDriverMessage: async () => { sends += 1; return { status: 200 }; } };
  const sent = async () => Number((await one<any>(`SELECT count(*) n FROM integrations.integration_sync_log WHERE sync_kind = 'driver_message_send' AND payload->>'message_id' = $1 AND payload->>'outcome' = 'sent'`, [msgId])).n);
  const before = { sent_rows: await sent(), sends };
  const results = await both(() => scoped((c) => deliverChatMessageToSamsara(c as never, msgId, sender)), () => scoped((c) => deliverChatMessageToSamsara(c as never, msgId, sender)));
  return { message: msgId, before, results: results.map((r: any) => (typeof r === "string" ? r : r.outcome)), after: { sent_rows: await sent(), sends } };
});

// 9 — location fence (stops-geocode-backfill): the exact lock + NOT EXISTS insert, two sessions at once on one
//     location with no active fence (the geocoder in front of it is an external call; the race is this statement pair)
await run("09_location_fence", async () => {
  const loc = await one<any>(`SELECT l.id::text FROM mdata.locations l WHERE l.operating_company_id = $1 AND l.deactivated_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM geo.geofences g WHERE g.location_ref_id = l.id AND g.is_active) LIMIT 1`, [OC]);
  const actor = (await one<any>(`SELECT id::text FROM identity.users ORDER BY created_at LIMIT 1`)).id;
  const src = readFileSync(new URL("../../apps/backend/src/telematics/stops-geocode-backfill.service.ts", import.meta.url), "utf8");
  if (!src.includes("geo.location_fence|")) throw new Error("lock not in source");
  const session = () => scoped(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`geo.location_fence|${OC}|${loc.id}`]);
    const r = await c.query(`
      INSERT INTO geo.geofences
        (operating_company_id,label,location_kind,location_ref_id,vertices_json,is_active,source,
         center_lat,center_lng,radius_m,approach_radius_m,enter_radius_m,exit_radius_m,created_by_user_uuid,updated_by_user_uuid)
      SELECT $1::uuid,'overlap proof','custom',$2::uuid,'[[27.5,-99.5],[27.5,-99.49],[27.51,-99.49],[27.51,-99.5]]'::jsonb,true,'auto_dispatch',27.505,-99.495,150,300,150,300,$3::uuid,$3::uuid
      WHERE NOT EXISTS (SELECT 1 FROM geo.geofences WHERE operating_company_id=$1::uuid AND location_ref_id=$2::uuid AND is_active)
      RETURNING id::text`, [OC, loc.id, actor]);
    await new Promise((res) => setTimeout(res, 300)); // hold the transaction open so the twin truly overlaps
    return r.rows.length;
  });
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM geo.geofences WHERE location_ref_id = $1 AND is_active`, [loc.id])).n);
  const before = await count();
  const results = await both(session, session);
  return { location: loc.id, before, inserted_per_session: results, after: await count() };
});

// 10 — CBP wait-times refresh: two whole ticks at once
await run("10_cbp_wait_times", async () => {
  const { runCbpWaitTimesRefreshTick } = await import("../../apps/backend/src/border-crossing/cbp-wait-times-refresh.job.js");
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM reference.cbp_wait_times_cache`)).n);
  const before = { cache_rows: await count(), cbp_calls: callsMatching(/cbp|bwt/i) };
  const results = await both(() => runCbpWaitTimesRefreshTick(), () => runCbpWaitTimesRefreshTick());
  return { before, results, after: { cache_rows: await count(), cbp_calls: callsMatching(/cbp|bwt/i) } };
});

// 11 — Samsara remote-count collector: two whole ticks at once
await run("11_remote_count_collector", async () => {
  const { runSamsaraRemoteCountCollectorTick } = await import("../../apps/backend/src/cron/samsara-remote-count-collector.cron.js");
  const app = { log: { info() {}, warn() {}, error() {}, debug() {} } };
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM integrations.samsara_remote_counts`)).n);
  const before = { samples: await count() };
  const results = await both(() => runSamsaraRemoteCountCollectorTick(app as never), () => runSamsaraRemoteCountCollectorTick(app as never));
  const afterConcurrent = { samples: await count() };
  await runSamsaraRemoteCountCollectorTick(app as never);
  return { before, results, afterConcurrent, single_run_for_comparison: { samples: await count() } };
});

// 12 — geofence breach detector (unchanged; already single-flight): the cron's own lock key, two sessions at once
await run("12_geofence_breach_detector", async () => {
  const { runGeofenceBreachDetectionTick } = await import("../../apps/backend/src/cron/geofence-breach-detector.cron.js");
  const src = readFileSync(new URL("../../apps/backend/src/cron/geofence-breach-detector.cron.ts", import.meta.url), "utf8");
  const key = /GEOFENCE_CRON_LOCK_KEY\s*=\s*["']([^"']+)["']/.exec(src)?.[1];
  if (!key) throw new Error("lock key not found");
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const until = new Date().toISOString();
  const session = () => withLuciaBypass(async (c: any) => {
    const lock = await c.query(`SELECT pg_try_advisory_lock(hashtext($1::text)) AS locked`, [key]);
    if (!lock.rows[0]?.locked) return "skipped (lock held by the twin)";
    try {
      await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [OC]);
      const s = await runGeofenceBreachDetectionTick(c, OC, since, until);
      await new Promise((res) => setTimeout(res, 300));
      return { ran: true, inserted: (s as any).inserted ?? (s as any).breaches_inserted ?? null };
    } finally { await c.query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [key]); }
  });
  const count = async () => Number((await one<any>(`SELECT count(*) n FROM safety.geofence_breach_events`)).n);
  const before = await count();
  const results = await both(session, session);
  return { window: [since, until], before, results, after: await count() };
});

console.log("\nEXTERNAL CALLS (all stubbed):", JSON.stringify(calls.reduce((m: Record<string, number>, c) => { const k = `${c.method} ${c.url.replace(/\?.*/, "").replace(/[0-9a-f-]{36}/g, ":id")}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
process.exit(0);
