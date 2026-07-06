/**
 * Relay Payments fuel-transaction daily ingest cron.
 *
 * Behind RELAY_FUEL_INGEST_ENABLED (default OFF, per-entity-only override — see
 * apps/backend/src/lib/feature-flags/service.ts). For each active operating company with the flag ON,
 * pulls the prior day's Relay fuel transactions and upserts them via
 * integrations/relay-payments/relay-fuel-ingest.service.ts.
 *
 * ERROR POLICY: a single company's failure is logged AND recorded, but does not abort the other
 * companies in the same tick (isolation, same pattern as fuel-gps-match.cron.ts). At the end of the
 * tick, if ANY company failed, the whole tick's error is re-thrown (aggregated) so the failure is never
 * silently swallowed — it surfaces to node-cron's rejection path / process logs / Sentry, exactly like
 * any other uncaught background-job failure. This intentionally does NOT use wrapBackgroundJobTick,
 * which only logs and does not rethrow.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { listRelayFuelTransactions, parseRelayFuelTransactionRow, RelayApiError } from "./relay-client.js";
import { upsertRelayFuelTransaction } from "./relay-fuel-ingest.service.js";

let initialized = false;
const RELAY_FUEL_INGEST_AUDIT_SOURCE = "RELAY-FUEL-INGEST-1";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First day of the month `n` months before today (UTC), ISO date. */
function isoDateMonthsAgo(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive monthly [startDate,endDate] windows from `months` ago through today (UTC).
 * Chunked monthly so a deep historical pull stays within Relay API response limits; any
 * boundary overlap is harmless because the upsert is idempotent by transaction_id.
 */
function monthlyWindows(months: number): Array<{ startDate: string; endDate: string }> {
  const windows: Array<{ startDate: string; endDate: string }> = [];
  for (let i = months; i >= 0; i -= 1) {
    windows.push({ startDate: isoDateMonthsAgo(i), endDate: i === 0 ? todayIsoDate() : isoDateMonthsAgo(i - 1) });
  }
  return windows;
}

async function listActiveCompanyIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return res.rows.map((r) => r.id);
}

async function ingestForCompany(
  client: DbClient,
  app: FastifyInstance,
  operatingCompanyId: string,
  startDate: string,
  endDate: string
): Promise<{ pulled: number; upserted: number; skipped: number }> {
  assertTenantContext(operatingCompanyId, "relay_payments.fuel_ingest_cron");
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const rawRows = await listRelayFuelTransactions({ startDate, endDate });
  let upserted = 0;
  let skipped = 0;

  for (const rawRow of rawRows) {
    const parsed = parseRelayFuelTransactionRow(rawRow);
    if (!parsed) {
      skipped += 1;
      app.log.warn(
        { operating_company_id: operatingCompanyId, raw_transaction_id: rawRow.transaction_id },
        "[RELAY_FUEL_INGEST_CRON] skipped unparsable row"
      );
      continue;
    }
    const result = await upsertRelayFuelTransaction(client, operatingCompanyId, parsed, "daily_pull");
    upserted += 1;
    if (!result.matched_driver_id || !result.matched_unit_id) {
      app.log.info(
        {
          operating_company_id: operatingCompanyId,
          transaction_id: result.transaction_id,
          matched_driver_id: result.matched_driver_id,
          matched_unit_id: result.matched_unit_id,
        },
        "[RELAY_FUEL_INGEST_CRON] transaction ingested with an unresolved driver or unit match"
      );
    }
  }

  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "integrations.relay_fuel_ingest_daily_pull",
    "info",
    JSON.stringify({ operating_company_id: operatingCompanyId, start_date: startDate, end_date: endDate, pulled: rawRows.length, upserted, skipped }),
    RELAY_FUEL_INGEST_AUDIT_SOURCE,
  ]);

  return { pulled: rawRows.length, upserted, skipped };
}

export function initializeRelayFuelIngestCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.RELAY_FUEL_INGEST_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Relay fuel ingest cron disabled via RELAY_FUEL_INGEST_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 7 * * *", // 07:00 America/Chicago daily — prior day's transactions
    async () => {
      const startDate = yesterdayIsoDate();
      const endDate = startDate;
      const failures: { operating_company_id: string; error: unknown }[] = [];

      await withLuciaBypass(async (client) => {
        const companyIds = await listActiveCompanyIds(client);
        for (const operatingCompanyId of companyIds) {
          const flagOn = await isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: operatingCompanyId });
          if (!flagOn) continue;

          try {
            const stats = await ingestForCompany(client, app, operatingCompanyId, startDate, endDate);
            app.log.info({ operating_company_id: operatingCompanyId, ...stats }, "[RELAY_FUEL_INGEST_CRON] run complete");
          } catch (error) {
            // Log loudly, record to the shared audit stream, and keep processing the REMAINING
            // companies — but never swallow: the error is collected and re-thrown after the loop.
            app.log.error({ err: error, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] company ingest failed");
            failures.push({ operating_company_id: operatingCompanyId, error });
            await client
              .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
                "integrations.relay_fuel_ingest_daily_pull_failed",
                "error",
                JSON.stringify({
                  operating_company_id: operatingCompanyId,
                  error: error instanceof RelayApiError
                    ? { name: error.name, message: error.message, status: error.statusCode, retryable: error.retryable }
                    : { message: String((error as Error)?.message ?? error) },
                }),
                RELAY_FUEL_INGEST_AUDIT_SOURCE,
              ])
              .catch((auditErr) => {
                app.log.warn({ err: auditErr, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] failure-audit write failed");
              });
          }
        }
      });

      if (failures.length > 0) {
        // Never silently swallow — surface the aggregated failure so it reaches process-level
        // logging/Sentry, exactly like any other uncaught background-job error.
        throw new Error(
          `relay_fuel_ingest_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
            failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
        );
      }
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Relay fuel ingest cron scheduled (daily 07:00 America/Chicago)");
}

/**
 * One-shot HISTORICAL BACKFILL — pulls the maximum available past Relay fuel transactions
 * for each active, flag-ON operating company. Default 24 months (RELAY_FUEL_INGEST_BACKFILL_MONTHS),
 * chunked monthly. Idempotent (upsert by transaction_id), so safe to re-run; Relay returns only
 * what exists, so "24 months or more" naturally yields whatever history is available.
 * Jorge 2026-07-05: "set to maximum past time, 24 months or more if available."
 */
export async function runRelayFuelBackfill(app: FastifyInstance, opts?: { months?: number }): Promise<void> {
  const months =
    opts?.months ?? (Number.parseInt(process.env.RELAY_FUEL_INGEST_BACKFILL_MONTHS ?? "24", 10) || 24);
  const windows = monthlyWindows(months);
  const failures: { operating_company_id: string; error: unknown }[] = [];

  await withLuciaBypass(async (client) => {
    const companyIds = await listActiveCompanyIds(client);
    for (const operatingCompanyId of companyIds) {
      const flagOn = await isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: operatingCompanyId });
      if (!flagOn) continue;

      let pulled = 0;
      let upserted = 0;
      let skipped = 0;
      try {
        for (const w of windows) {
          const stats = await ingestForCompany(client, app, operatingCompanyId, w.startDate, w.endDate);
          pulled += stats.pulled;
          upserted += stats.upserted;
          skipped += stats.skipped;
        }
        app.log.info(
          { operating_company_id: operatingCompanyId, months, windows: windows.length, pulled, upserted, skipped },
          "[RELAY_FUEL_INGEST_BACKFILL] company backfill complete"
        );
      } catch (error) {
        // Isolate per-company failure, never swallow — collected and re-thrown after the loop.
        app.log.error(
          { err: error, operating_company_id: operatingCompanyId },
          "[RELAY_FUEL_INGEST_BACKFILL] company backfill failed"
        );
        failures.push({ operating_company_id: operatingCompanyId, error });
      }
    }
  });

  if (failures.length > 0) {
    throw new Error(
      `relay_fuel_ingest_backfill: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
    );
  }
}
