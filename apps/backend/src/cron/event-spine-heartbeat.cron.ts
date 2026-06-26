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

// TODO(00b): wire to the real dispatcher so CRITICAL fans out to ALL THREE channels.
//   - on-screen: createNotification(...) (notifications/notification.service.ts)
//   - email + SMS: dispatchNotification(...) (notifications/dispatcher.ts → enqueueEmail + sendSms)
// Confirm exact signatures/payload keys (email_subject, sms_body, in-app body) before enabling.
// The alarm path itself must FAIL LOUD (log + retry) — never swallow, or we rebuild the silent failure.
async function alarmOwnerEverywhere(
  app: FastifyInstance,
  severity: "critical" | "warning",
  summary: Record<string, unknown>,
) {
  app.log.error({ severity, summary }, "[spine-heartbeat] ALARM — wire to dispatchNotification (00b)");
  // TODO: await dispatchNotification({ ...email + sms... }); await createNotification({ ...on-screen... });
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
            await alarmOwnerEverywhere(app, "critical", summary);
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
