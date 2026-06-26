// BLOCK-RELIABILITY-05 — Event-Spine Heartbeat (SKELETON / pre-draft)
// Tier-3, non-financial: READ-ONLY monitor + alarm. Posts no money, flips no flag, repairs no event.
//
// WHY: build-time guards (verify-event-log-spine.mjs) prove the code CAN write the spine; they do NOT
// prove events ARE being written in prod. The spine died silently in prod while CI was green
// (#1491/#1501 era). Only a RUNTIME, POSITIVE-SIGNAL heartbeat catches that: "operational actions are
// happening but ZERO events are landing → ALARM."
//
// STATUS: SKELETON. Structure + real wiring points are in place; items marked TODO must be filled +
// verified against db/migrations BEFORE flipping the flag ON. Default OFF until reviewed.
//
// DESIGN DECISIONS (grounded in live schema, 2026-06-25):
//   - Sink = audit.append_event(...) (the error-digest.cron pattern; append-only, no enum constraint).
//     NOT _system.reconciliation_findings — its CHECK enums (integration qbo|samsara|plaid|fmcsa;
//     finding_type count_drift|...) have NO 'spine' category, so writing there needs a gated migration.
//   - Alarm fan-out = email + on-screen + SMS per 00b-ALARM-DELIVERY-SPEC (reuse dispatchNotification /
//     createNotification — do NOT build a new notifier).
//   - Spine liveness keys on events.event_log.created_at (verified column: "when written to the spine").
//   - event_log has RLS (USING app.current_operating_company_id) → the read MUST run per operating
//     company with that GUC set, or counts read as 0. Skeleton loops companies and SETs the GUC.

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { dispatchReliabilityAlarm } from "../notifications/reliability-alarm.js";

const INTERVAL_MS = 15 * 60 * 1000; // every 15 min
const WINDOW_MIN = 15; // look-back window for "did events land?"
const GAP_WARN_HOURS = 6; // longest-silence WARN threshold during business hours

function enabled(): boolean {
  // Default OFF until reviewed; Jorge/flag flips ON. Read-only, so safe to enable.
  return (process.env.EVENT_SPINE_HEARTBEAT_ENABLED ?? "false") === "true";
}

// TODO(verify-before-enable): confirm each proxy table + column against db/migrations (avoid phantom
// columns — the recurring 500 class). Each entry: a table that proves "an operational action happened",
// with a timestamp column to window on. Wrapped degrade-safe below so a bad entry warns, never crashes.
const OPERATIONAL_PROXIES: Array<{ label: string; table: string; tsColumn: string }> = [
  // { label: "load_booked",   table: "mdata.loads",        tsColumn: "created_at" },
  // { label: "bill_created",  table: "accounting.bills",   tsColumn: "created_at" },
  // { label: "advance_made",  table: "driver_finance.driver_advances", tsColumn: "created_at" },
];

type CompanyHeartbeat = {
  operatingCompanyId: string;
  eventWrites: number;
  operationalWrites: number;
  hoursSinceLastEvent: number | null;
};

/** Read-only liveness probe for ONE operating company (GUC set for event_log RLS). */
async function probeCompany(operatingCompanyId: string): Promise<CompanyHeartbeat> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.current_operating_company_id', $1, true)`, [
      operatingCompanyId,
    ]);

    const ev = await client.query<{ n: string; hrs: string | null }>(
      `SELECT count(*)::text AS n,
              EXTRACT(EPOCH FROM (now() - max(created_at))) / 3600.0 AS hrs
         FROM events.event_log
        WHERE created_at > now() - ($1 || ' minutes')::interval`,
      [String(WINDOW_MIN)],
    );

    let operationalWrites = 0;
    for (const p of OPERATIONAL_PROXIES) {
      try {
        // table/column are from a fixed internal allow-list (not user input); verified before enable.
        const r = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${p.table}
            WHERE ${p.tsColumn} > now() - ($1 || ' minutes')::interval`,
          [String(WINDOW_MIN)],
        );
        operationalWrites += Number(r.rows[0]?.n ?? 0);
      } catch {
        // degrade-safe: a mis-named proxy must not crash the heartbeat (TODO: surface as a WARN finding).
      }
    }

    return {
      operatingCompanyId,
      eventWrites: Number(ev.rows[0]?.n ?? 0),
      operationalWrites,
      hoursSinceLastEvent: ev.rows[0]?.hrs == null ? null : Number(ev.rows[0].hrs),
    };
  });
}

async function appendHeartbeatAudit(severity: "critical" | "warning", summary: Record<string, unknown>) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`, [
      "admin.spine_heartbeat",
      severity,
      JSON.stringify(summary),
      "BLOCK-RELIABILITY-05",
    ]);
  }).catch(() => undefined);
}

// Wired to the shared alarm spine (BLOCK-RELIABILITY-08): CRITICAL fans out on-screen + email + SMS
// per 00b; the helper is fail-loud per channel (logs + returns, never swallows).
async function alarmOwnerEverywhere(
  app: FastifyInstance,
  operatingCompanyId: string,
  severity: "critical" | "warning",
  summary: Record<string, unknown>,
) {
  const title =
    severity === "critical"
      ? "Event spine SILENT while operations are running"
      : "Event spine quiet gap";
  const dispatch = await dispatchReliabilityAlarm(
    {
      operatingCompanyId,
      severity,
      source: "spine-heartbeat",
      title,
      body: `[spine-heartbeat] ${JSON.stringify(summary)}`,
      smsBody: `IH35 ${severity.toUpperCase()}: event spine — ${String(summary.reason ?? "alarm")}`,
    },
    app.log,
  );
  app.log.error({ severity, summary, dispatch }, "[spine-heartbeat] ALARM dispatched (00b 3-channel)");
}

/** TODO: enumerate active operating companies (org.companies WHERE is_active). Skeleton: TRANSP only. */
async function listOperatingCompanies(): Promise<string[]> {
  return ["91e0bf0a-133f-4ce8-a734-2586cfa66d96"]; // TRANSP
}

export function initializeEventSpineHeartbeatCron(app: FastifyInstance) {
  if (!enabled()) {
    app.log.info("[spine-heartbeat] disabled (EVENT_SPINE_HEARTBEAT_ENABLED!=true) — skeleton, not active");
    return;
  }

  setInterval(() => {
    void (async () => {
      try {
        const companies = await listOperatingCompanies();
        for (const oci of companies) {
          const hb = await probeCompany(oci);

          // (a) THE silent-failure shape: operational actions happened, but ZERO events landed → CRITICAL.
          if (hb.operationalWrites > 0 && hb.eventWrites === 0) {
            const summary = { reason: "spine_silent_with_traffic", ...hb, window_min: WINDOW_MIN };
            await appendHeartbeatAudit("critical", summary);
            await alarmOwnerEverywhere(app, oci, "critical", summary);
            continue;
          }

          // (b) longest-silence WARN (business hours) — informational, lower severity.
          if (hb.hoursSinceLastEvent != null && hb.hoursSinceLastEvent > GAP_WARN_HOURS) {
            // TODO: gate on business-hours + suppress in genuinely idle windows (no operational writes).
            const summary = { reason: "spine_quiet_gap", ...hb, gap_warn_hours: GAP_WARN_HOURS };
            await appendHeartbeatAudit("warning", summary);
          }
        }
      } catch (error) {
        app.log.warn({ err: error }, "[spine-heartbeat] probe failed");
      }
    })();
  }, INTERVAL_MS);

  app.log.info("[spine-heartbeat] 15m scheduler initialized");
}

// WIRING (when ready): in apps/backend/src/index.ts, alongside the other initialize*Cron calls:
//   import { initializeEventSpineHeartbeatCron } from "./cron/event-spine-heartbeat.cron.js";
//   initializeEventSpineHeartbeatCron(app);
// Inert while EVENT_SPINE_HEARTBEAT_ENABLED!=true.
//
// COMPANION (separate PR, BLOCK-RELIABILITY-05 part 2): money/audit error-surfacing sweep —
// grep posting/audit/settlement paths for empty catch blocks, make them fail-loud, and add
// scripts/verify-no-swallow-on-money-paths.mjs to the CI chain so swallows can't return.
