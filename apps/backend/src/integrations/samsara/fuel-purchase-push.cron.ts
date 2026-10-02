/**
 * ENGINE: Samsara fuel-purchase push
 * SCHEDULE: 0 6,18 * * *
 * WRITES: external Samsara fuel purchase POST, integration_sync_log
 * IDEMPOTENCY: ADVISORY LOCK pg_try_advisory_xact_lock per company around ledger read, POST and ledger write
 * OVERLAP: an overlapping tick fails the lock and posts nothing
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 304 T-48 — twice-daily Samsara fuel-purchase push (06:00 and 18:00 America/Chicago).
 *
 * Writes to Samsara only when SAMSARA_FUEL_PURCHASE_PUSH_APPLY=true. Otherwise every tick is a dry
 * run: it computes the full push/skip plan and records ONE audit event with the counts — no POST,
 * no ledger rows. The gate itself lives in fuel-purchase-push.service.ts.
 *
 * ERROR POLICY: same as fault-poll.cron.ts — one company's failure is isolated and audited, and the
 * aggregated failure is re-thrown at the end of the tick, never swallowed.
 */
import { resolveSamsaraApiToken } from "./samsara-token.js";
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { tryXactSingleFlight } from "../../lib/single-flight.js";
import { wrapBackgroundJobTick } from "../../lib/background-jobs.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { runFuelPurchasePush } from "./fuel-purchase-push.service.js";
import { SamsaraClient } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

const AUDIT_SOURCE = "SAMSARA-FUEL-PURCHASE-PUSH-CRON-1";

export function fuelPurchasePushApplyEnabled(): boolean {
  return process.env.SAMSARA_FUEL_PURCHASE_PUSH_APPLY === "true";
}

async function pushForCompany(client: PgClient, operatingCompanyId: string): Promise<void> {
  // ROUND 329: the ever-pushed ledger read (:143) -> Samsara POST -> sync-log INSERT is read-then-write; two replicas /
  // overlapping ticks would both POST the same purchase. One tick per company holds the DB lock; the other skips.
  if (!(await tryXactSingleFlight(client, `samsara.fuel_purchase_push:${operatingCompanyId}`))) return;
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) return;
  const apply = fuelPurchasePushApplyEnabled();
  const poster = apply
    ? new SamsaraClient({
        apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>),
        samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
      })
    : null;
  const result = await runFuelPurchasePush(client, operatingCompanyId, { apply, poster });
  const { push_sample: _sample, ...counts } = result;
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "integrations.samsara_fuel_purchase_push",
    result.failed > 0 ? "warning" : "info",
    JSON.stringify(counts),
    AUDIT_SOURCE,
  ]);
}

export async function runFuelPurchasePushCronTick(): Promise<void> {
  const failures: { operating_company_id: string; message: string }[] = [];
  const companyIds = await withLuciaBypass(async (client) => {
    const res = await client.query(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    return res.rows.map((r: { id: string }) => String(r.id));
  });

  for (const operatingCompanyId of companyIds) {
    try {
      assertTenantContext(operatingCompanyId, "integrations.samsara_fuel_purchase_push_cron");
      await withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await pushForCompany(client as PgClient, operatingCompanyId);
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      failures.push({ operating_company_id: operatingCompanyId, message });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "integrations.samsara_fuel_purchase_push_failed",
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
      `samsara_fuel_purchase_push_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${f.message})`).join("; ")
    );
  }
}

let initialized = false;

export function initializeFuelPurchasePushCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.SAMSARA_FUEL_PURCHASE_PUSH_CRON_ENABLED === "false") {
    app.log.info("Samsara fuel-purchase push cron disabled via SAMSARA_FUEL_PURCHASE_PUSH_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 6,18 * * *",
    // ROUND 330.1: through the shared wrapper (run recorded; failure logged, sent to Sentry, then re-thrown).
    async () => wrapBackgroundJobTick("integrations.samsara_fuel_purchase_push", runFuelPurchasePushCronTick, app.log, { rethrow: true }),
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info(
    `Samsara fuel-purchase push cron scheduled (06:00 + 18:00 America/Chicago, ${fuelPurchasePushApplyEnabled() ? "APPLY" : "dry run"})`
  );
}
