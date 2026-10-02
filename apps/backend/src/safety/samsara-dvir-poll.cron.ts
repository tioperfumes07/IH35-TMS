/**
 * ENGINE: Samsara DVIR poll
 * SCHEDULE: *\/15 * * * * (poll) + 40 3 * * * (daily re-read)
 * WRITES: safety DVIR rows
 * IDEMPOTENCY: UNIQUE(operating_company_id, client_request_id) ON CONFLICT DO UPDATE WHERE IS DISTINCT FROM
 * OVERLAP: second run rewrites 0 rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 304 T-51 / ORDERS 2026-10-01 row 6 — Samsara DVIR import as a scheduled engine.
 * Every 15 min (America/Chicago) over the last 1 day, plus 03:40 daily over the last 7 days so a DVIR
 * Samsara later marks 'resolved' is re-read and its WF-050 major-defect flag cleared. Idempotent on
 * client_request_id (proved: re-run 56 unchanged, 0 dupes). Writes its own output table only
 * (safety.dvir_submissions) through ingestSamsaraDvirs. SAMSARA_DVIR_POLL_CRON_ENABLED=false disables it.
 *
 * ERROR POLICY: same as fault-poll.cron.ts — one company's failure is isolated and audited, and the
 * aggregated failure is re-thrown at the end of the tick, never swallowed.
 */
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { ingestSamsaraDvirs } from "./samsara-dvir-ingest.service.js";

const AUDIT_SOURCE = "SAMSARA-DVIR-POLL-CRON-1";
export const DVIR_POLL_LOOKBACK_DAYS = 1;
export const DVIR_DAILY_REREAD_DAYS = 7;

async function pollForCompany(client: PgClient, operatingCompanyId: string, tickAt: Date, lookbackDays: number): Promise<void> {
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) return;
  const api = new SamsaraClient({
    apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>),
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });
  const endIso = tickAt.toISOString();
  const startIso = new Date(tickAt.getTime() - lookbackDays * 86_400_000).toISOString();
  const dvirs = await api.listDvirs(startIso, endIso);
  const result = await ingestSamsaraDvirs(client, operatingCompanyId, dvirs, { apply: true });
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "safety.samsara_dvir_poll",
    "info",
    JSON.stringify({ ...result, window_start: startIso, window_end: endIso }),
    AUDIT_SOURCE,
  ]);
}

export async function runSamsaraDvirPollCronTick(tickAt = new Date(), lookbackDays = DVIR_POLL_LOOKBACK_DAYS): Promise<void> {
  const failures: { operating_company_id: string; message: string }[] = [];
  const companyIds = await withLuciaBypass(async (client) => {
    const res = await client.query(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    return res.rows.map((r: { id: string }) => String(r.id));
  });

  for (const operatingCompanyId of companyIds) {
    try {
      assertTenantContext(operatingCompanyId, "safety.samsara_dvir_poll_cron");
      await withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await pollForCompany(client as PgClient, operatingCompanyId, tickAt, lookbackDays);
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      failures.push({ operating_company_id: operatingCompanyId, message });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "safety.samsara_dvir_poll_failed",
            "warning",
            JSON.stringify({ operating_company_id: operatingCompanyId, error: message }),
            AUDIT_SOURCE,
          ])
          .catch(() => {});
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `samsara_dvir_poll_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${f.message})`).join("; ")
    );
  }
}

let initialized = false;

export function initializeSamsaraDvirPollCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.SAMSARA_DVIR_POLL_CRON_ENABLED === "false") {
    app.log.info("Samsara DVIR poll cron disabled via SAMSARA_DVIR_POLL_CRON_ENABLED=false");
    return;
  }

  const schedule = (expr: string, lookbackDays: number, jobName: string) =>
    cron.schedule(
      expr,
      // ROUND 330.1: through the shared wrapper (run recorded; failure logged, sent to Sentry, then re-thrown).
      async () => wrapBackgroundJobTick(jobName, () => runSamsaraDvirPollCronTick(new Date(), lookbackDays), app.log, { rethrow: true }),
      {
        maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
    );
  schedule("*/15 * * * *", DVIR_POLL_LOOKBACK_DAYS, "safety.samsara_dvir_poll");
  schedule("40 3 * * *", DVIR_DAILY_REREAD_DAYS, "safety.samsara_dvir_poll_daily_reread");

  app.log.info("Samsara DVIR poll cron scheduled (every 15 min, 1-day window; 03:40 daily 7-day re-read; America/Chicago)");
}
