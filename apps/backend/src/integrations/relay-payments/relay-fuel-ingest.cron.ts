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
import {
  flushFuelGlPostsAfterCommit,
  type FuelTxnGlPostCandidate,
} from "../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { flushFuelCardOverageAfterCommit } from "../../fuel/fuel-card-overage.service.js";
import {
  fetchAllRelayFuelTransactions,
  filterRelayFuelTransactionsByDateRange,
  listRelayFuelTransactions,
  parseRelayFuelTransactionRow,
  type RelayFuelTransaction,
  RelayApiError,
} from "./relay-client.js";
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

/** Ingest window size in days — DB BATCHING ONLY (owner directive 2026-07-15 kept the 3-day granularity).
 *  HTTP filtering uses Relay `dtstart`/`dtend` (Mike 2026-07-16). These windows still slice an already-
 *  fetched (or date-filtered) snapshot for upsert batching + audit granularity.
 *  Configurable via RELAY_FUEL_INGEST_WINDOW_DAYS; default 3. */
function relayIngestWindowDays(): number {
  const raw = Number.parseInt(process.env.RELAY_FUEL_INGEST_WINDOW_DAYS ?? "3", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

/** Mike (Relay, 2026-07-16): "We have a 10 second limit on pulling transactions" — min gap between pulls. */
function relayInterCompanyDelayMs(): number {
  const raw = Number.parseInt(process.env.RELAY_FUEL_INGEST_INTER_COMPANY_MS ?? "10000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10000;
}

/**
 * Inclusive, contiguous [startDate,endDate] windows of `windowDays` each covering [startIso, endIso],
 * oldest→newest, with NO gaps and NO overlaps (each window's end is the day before the next window's start).
 * Windows batch DB upserts after a server-filtered (`dtstart`/`dtend`) or full-history pull; the upsert is
 * idempotent by transaction_id so a boundary or re-run never duplicates. The daily cron reuses this with a
 * 1-day range (start === end) → a single window.
 */
export function dayWindows(startIso: string, endIso: string, windowDays: number): Array<{ startDate: string; endDate: string }> {
  const windows: Array<{ startDate: string; endDate: string }> = [];
  const end = new Date(`${endIso}T00:00:00Z`);
  const step = Math.max(1, windowDays);
  let cursor = new Date(`${startIso}T00:00:00Z`);
  // Guard against a bad range (start after end) → no windows rather than an infinite loop.
  while (cursor.getTime() <= end.getTime()) {
    const wEnd = new Date(cursor);
    wEnd.setUTCDate(wEnd.getUTCDate() + step - 1);
    if (wEnd.getTime() > end.getTime()) wEnd.setTime(end.getTime());
    windows.push({ startDate: cursor.toISOString().slice(0, 10), endDate: wEnd.toISOString().slice(0, 10) });
    const next = new Date(wEnd);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next;
  }
  return windows;
}

async function listActiveCompanyIds(client: DbClient): Promise<{ id: string; code: string | null }[]> {
  const res = await client.query<{ id: string; code: string | null }>(
    `SELECT id::text AS id, code FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return res.rows.map((r) => ({ id: r.id, code: r.code }));
}

async function ingestForCompany(
  client: DbClient,
  app: FastifyInstance,
  operatingCompanyId: string,
  startDate: string,
  endDate: string,
  entityCode: string | null,
  opts?: { preloaded?: RelayFuelTransaction[] }
): Promise<{ pulled: number; upserted: number; skipped: number; gl_post_candidates: FuelTxnGlPostCandidate[] }> {
  assertTenantContext(operatingCompanyId, "relay_payments.fuel_ingest_cron");
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  // Network I/O must stay OUTSIDE withLuciaBypass — callers pass `preloaded` for backfill, or we filter a
  // single in-memory snapshot (daily cron fetches once per company before opening the DB txn).
  const rawRows =
    opts?.preloaded ??
    (await listRelayFuelTransactions({
      startDate,
      endDate,
      entityCode,
    }));
  let upserted = 0;
  let skipped = 0;
  const gl_post_candidates: FuelTxnGlPostCandidate[] = [];

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
    if (result.gl_post_candidate) gl_post_candidates.push(result.gl_post_candidate);
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

  return { pulled: rawRows.length, upserted, skipped, gl_post_candidates };
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
      const pendingGlPosts: FuelTxnGlPostCandidate[] = [];

      const companyIds = await withLuciaBypass(async (client) => listActiveCompanyIds(client));
      const interCompanyDelayMs = relayInterCompanyDelayMs();
      let companiesPulled = 0;

      for (const { id: operatingCompanyId, code: entityCode } of companyIds) {
        const flagOn = await withLuciaBypass(async (client) =>
          isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: operatingCompanyId })
        );
        if (!flagOn) continue;

        if (companiesPulled > 0 && interCompanyDelayMs > 0) {
          await new Promise((r) => setTimeout(r, interCompanyDelayMs));
        }
        companiesPulled += 1;

        try {
          // Server-side date filter via dtstart/dtend (Mike 2026-07-16) — daily delta, not full dump.
          // Client-side filter remains as a defensive fallback after the response.
          const { rows: apiRows, meta } = await fetchAllRelayFuelTransactions(entityCode, {
            startDate,
            endDate,
          });
          const windowRows = filterRelayFuelTransactionsByDateRange(apiRows, startDate, endDate);
          app.log.info(
            {
              operating_company_id: operatingCompanyId,
              entity_code: entityCode,
              api_rows: meta.api_row_count,
              window_rows: windowRows.length,
              window: `${startDate}..${endDate}`,
              dtstart: startDate,
              dtend: endDate,
            },
            "[RELAY_FUEL_INGEST_CRON] relay pull complete"
          );

          const stats = await withLuciaBypass(async (client) =>
            ingestForCompany(client, app, operatingCompanyId, startDate, endDate, entityCode, {
              preloaded: windowRows,
            })
          );
          pendingGlPosts.push(...stats.gl_post_candidates);
          app.log.info(
            {
              operating_company_id: operatingCompanyId,
              pulled: stats.pulled,
              upserted: stats.upserted,
              skipped: stats.skipped,
              gl_post_pending: stats.gl_post_candidates.length,
            },
            "[RELAY_FUEL_INGEST_CRON] run complete"
          );
        } catch (error) {
          app.log.error({ err: error, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] company ingest failed");
          failures.push({ operating_company_id: operatingCompanyId, error });
          await withLuciaBypass(async (client) => {
            await client
              .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
                "integrations.relay_fuel_ingest_daily_pull_failed",
                "warning",
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
          });
        }
      }

      // AFTER COMMIT — TMS GL only, gated by EXPENSE_GL_POSTING_ENABLED (default OFF).
      await flushFuelGlPostsAfterCommit(pendingGlPosts, app.log);

      // AFTER COMMIT — BANK-DOM-06 card-overage -> driver receivable -> settlement deduction,
      // gated by FUEL_CARD_OVERAGE_RECOVERY_ENABLED (default OFF).
      await flushFuelCardOverageAfterCommit(pendingGlPosts, app.log);

      if (failures.length > 0) {
        // Never silently swallow — surface the aggregated failure so it reaches process-level
        // logging/Sentry, exactly like any other uncaught background-job error.
        throw new Error(
          `relay_fuel_ingest_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
            failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
        );
      }
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Relay fuel ingest cron scheduled (daily 07:00 America/Chicago)");
}

/**
 * One-shot HISTORICAL BACKFILL — pulls the maximum available past Relay fuel transactions
 * for each active, flag-ON operating company. Default 24 months (RELAY_FUEL_INGEST_BACKFILL_MONTHS),
 * chunked into small (default 3-day, RELAY_FUEL_INGEST_WINDOW_DAYS) windows so a busy carrier's volume never
 * exceeds the per-request timeout. Idempotent + RESUMABLE (upsert by transaction_id), so a re-run continues
 * rather than duplicating or restarting; Relay returns only what exists, so "24 months or more" naturally
 * yields whatever history is available. Jorge 2026-07-05: "set to maximum past time, 24 months or more if
 * available." Owner directive 2026-07-15: pull in 3-day windows.
 */
export async function runRelayFuelBackfill(
  app: FastifyInstance,
  opts?: { months?: number; operatingCompanyId?: string; runId?: string }
): Promise<void> {
  const months =
    opts?.months ?? (Number.parseInt(process.env.RELAY_FUEL_INGEST_BACKFILL_MONTHS ?? "24", 10) || 24);
  const windowDays = relayIngestWindowDays();
  const windows = dayWindows(isoDateMonthsAgo(months), todayIsoDate(), windowDays);
  const failures: { operating_company_id: string; error: unknown }[] = [];
  const pendingGlPosts: FuelTxnGlPostCandidate[] = [];
  let totalPulled = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;

  const activeCompanyIds = await withLuciaBypass(async (client) => listActiveCompanyIds(client));
  const companyIds = opts?.operatingCompanyId
    ? activeCompanyIds.filter(({ id }) => id === opts.operatingCompanyId)
    : activeCompanyIds;
  if (opts?.operatingCompanyId && companyIds.length === 0) {
    throw new Error("relay_fuel_ingest_backfill_company_not_active");
  }

  const interCompanyDelayMs = relayInterCompanyDelayMs();
  let companiesPulled = 0;

  for (const { id: operatingCompanyId, code: entityCode } of companyIds) {
    const flagOn = await withLuciaBypass(async (client) =>
      isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: operatingCompanyId })
    );
    if (!flagOn) continue;

    if (companiesPulled > 0 && interCompanyDelayMs > 0) {
      await new Promise((r) => setTimeout(r, interCompanyDelayMs));
    }
    companiesPulled += 1;

    let pulled = 0;
    let upserted = 0;
    let skipped = 0;
    try {
      // Server-side date filter via dtstart/dtend (Mike) — avoids downloading history older than the
      // requested months window. Client-side windowing still batches DB upserts.
      const rangeStart = isoDateMonthsAgo(months);
      const rangeEnd = todayIsoDate();
      const { rows: apiRows, meta } = await fetchAllRelayFuelTransactions(entityCode, {
        startDate: rangeStart,
        endDate: rangeEnd,
      });
      app.log.info(
        {
          operating_company_id: operatingCompanyId,
          entity_code: entityCode,
          api_rows: meta.api_row_count,
          windows: windows.length,
          months,
          dtstart: rangeStart,
          dtend: rangeEnd,
        },
        "[RELAY_FUEL_INGEST_BACKFILL] relay pull complete — slicing windows client-side"
      );

      if (apiRows.length === 0) {
        app.log.warn(
          { operating_company_id: operatingCompanyId, entity_code: entityCode },
          "[RELAY_FUEL_INGEST_BACKFILL] relay API returned zero transactions for entity — verify key/account with Relay"
        );
      }

      // One DB commit per company so partial progress + audit rows survive a later-window failure.
      await withLuciaBypass(async (client) => {
        for (const [idx, w] of windows.entries()) {
          const windowRows = filterRelayFuelTransactionsByDateRange(apiRows, w.startDate, w.endDate);
          const stats = await ingestForCompany(client, app, operatingCompanyId, w.startDate, w.endDate, entityCode, {
            preloaded: windowRows,
          });
          pulled += stats.pulled;
          upserted += stats.upserted;
          skipped += stats.skipped;
          pendingGlPosts.push(...stats.gl_post_candidates);
          app.log.info(
            {
              operating_company_id: operatingCompanyId,
              window: `${w.startDate}..${w.endDate}`,
              window_index: idx + 1,
              window_total: windows.length,
              pulled: stats.pulled,
              upserted: stats.upserted,
              skipped: stats.skipped,
              gl_post_pending: stats.gl_post_candidates.length,
            },
            "[RELAY_FUEL_INGEST_BACKFILL] window complete"
          );
        }
      });

      app.log.info(
        { operating_company_id: operatingCompanyId, months, window_days: windowDays, windows: windows.length, pulled, upserted, skipped },
        "[RELAY_FUEL_INGEST_BACKFILL] company backfill complete"
      );
      totalPulled += pulled;
      totalUpserted += upserted;
      totalSkipped += skipped;
    } catch (error) {
      app.log.error(
        { err: error, operating_company_id: operatingCompanyId },
        "[RELAY_FUEL_INGEST_BACKFILL] company backfill failed"
      );
      failures.push({ operating_company_id: operatingCompanyId, error });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "integrations.relay_fuel_ingest_backfill_failed",
            "warning",
            JSON.stringify({
              operating_company_id: operatingCompanyId,
              entity_code: entityCode,
              months,
              error:
                error instanceof RelayApiError
                  ? { name: error.name, message: error.message, status: error.statusCode, retryable: error.retryable }
                  : { message: String((error as Error)?.message ?? error) },
            }),
            RELAY_FUEL_INGEST_AUDIT_SOURCE,
          ])
          .catch((auditErr) => {
            app.log.warn(
              { err: auditErr, operating_company_id: operatingCompanyId },
              "[RELAY_FUEL_INGEST_BACKFILL] failure-audit write failed"
            );
          });
      });
    }
  }

  await flushFuelGlPostsAfterCommit(pendingGlPosts, app.log);
  await flushFuelCardOverageAfterCommit(pendingGlPosts, app.log);

  if (failures.length > 0) {
    throw new Error(
      `relay_fuel_ingest_backfill: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
    );
  }
  if (opts?.runId && opts.operatingCompanyId) {
    await withLuciaBypass((client) => client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, NULL, $3)`, [
      "integrations.relay_fuel_ingest_backfill_completed",
      JSON.stringify({ run_id: opts.runId, operating_company_id: opts.operatingCompanyId, months, pulled: totalPulled, upserted: totalUpserted, skipped: totalSkipped }),
      RELAY_FUEL_INGEST_AUDIT_SOURCE,
    ]));
  }
}
