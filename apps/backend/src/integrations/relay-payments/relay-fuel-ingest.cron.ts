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
import { upsertRelayFuelTransaction, type RelayIngestSource } from "./relay-fuel-ingest.service.js";
import { computeRelayIngestWindow } from "./relay-fuel-ingest-window.js";

const RELAY_SYNC_KIND = "relay_fuel_daily_pull";

/**
 * ROUND 306 E-20 — claim this company's tick in integrations.integration_sync_log under an advisory
 * lock. The backend runs 2 instances and each fires this cron, so every company was pulled twice a
 * day. The first instance claims; the second sees a claim from the last 30 minutes and skips. The
 * claim row is also the tick's visible record (the Relay cron previously wrote nothing there).
 */
async function claimRelayTick(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('relay_fuel_ingest:' || $1))`, [operatingCompanyId]);
  const recent = await client.query<{ id: string }>(
    `SELECT id::text FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'relay' AND sync_kind = $2
        AND started_at > now() - interval '30 minutes'
      LIMIT 1`,
    [operatingCompanyId, RELAY_SYNC_KIND]
  );
  if (recent.rows.length > 0) return null;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO integrations.integration_sync_log (operating_company_id, integration, sync_kind)
     VALUES ($1::uuid, 'relay', $2) RETURNING id::text`,
    [operatingCompanyId, RELAY_SYNC_KIND]
  );
  return ins.rows[0]?.id ?? null;
}

/** End date of this company's last SUCCESSFUL tick — the sync log, or the older audit trail. */
async function lastCoveredEndDate(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ end_date: string | null }>(
    `SELECT max(d)::text AS end_date FROM (
       SELECT (payload->>'end_date')::date AS d FROM integrations.integration_sync_log
        WHERE operating_company_id = $1::uuid AND integration = 'relay' AND sync_kind = $2 AND success = true
       UNION ALL
       SELECT (payload->>'end_date')::date FROM audit.audit_events
        WHERE source = $3 AND event_class = 'integrations.relay_fuel_ingest_daily_pull'
          AND payload->>'operating_company_id' = $1::text
     ) t`,
    [operatingCompanyId, RELAY_SYNC_KIND, RELAY_FUEL_INGEST_AUDIT_SOURCE]
  );
  return res.rows[0]?.end_date ?? null;
}

async function finishRelayTick(
  client: DbClient,
  logId: string,
  outcome: { success: boolean; rowsAdded: number; error: string | null; payload: Record<string, unknown> }
): Promise<void> {
  await client.query(
    `UPDATE integrations.integration_sync_log
        SET finished_at = now(), success = $2, rows_added = $3, error_message = $4, payload = $5::jsonb
      WHERE id = $1::uuid`,
    [logId, outcome.success, outcome.rowsAdded, outcome.error, JSON.stringify(outcome.payload)]
  );
}

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

/**
 * The ONE Relay ingest path. The 07:00 cron, the backfill and the webhook receiver (relay-fuel-webhook.routes.ts) all
 * land rows through here, so a fill arriving by push takes exactly the path a pulled fill takes — the webhook changes
 * arrival time, never the posting rule (Lead ROUND 353).
 */
export async function ingestForCompany(
  client: DbClient,
  app: Pick<FastifyInstance, "log">,
  operatingCompanyId: string,
  startDate: string,
  endDate: string,
  entityCode: string | null,
  opts?: { preloaded?: RelayFuelTransaction[]; source?: RelayIngestSource }
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
    const result = await upsertRelayFuelTransaction(client, operatingCompanyId, parsed, opts?.source ?? "daily_pull");
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

  const source = opts?.source ?? "daily_pull";
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    source === "daily_pull" ? "integrations.relay_fuel_ingest_daily_pull" : `integrations.relay_fuel_ingest_${source}`,
    "info",
    JSON.stringify({ operating_company_id: operatingCompanyId, source, start_date: startDate, end_date: endDate, pulled: rawRows.length, upserted, skipped }),
    RELAY_FUEL_INGEST_AUDIT_SOURCE,
  ]);

  return { pulled: rawRows.length, upserted, skipped, gl_post_candidates };
}

/**
 * One daily Relay tick for every flag-ON company (or only `operatingCompanyIds`): resume from the last
 * covered day, claim, pull, upsert, record. The cron calls this at 07:00 Chicago; an owner-authorized
 * ops run (scripts/ops) calls the very same function, so a manual pull can never take a different path.
 */
export async function runRelayFuelIngestTick(
  app: Pick<FastifyInstance, "log">,
  opts?: { operatingCompanyIds?: string[] }
): Promise<void> {
  const yesterday = yesterdayIsoDate();
  const failures: { operating_company_id: string; error: unknown }[] = [];
  const pendingGlPosts: FuelTxnGlPostCandidate[] = [];

  const companyIds = await withLuciaBypass(async (client) => listActiveCompanyIds(client));
  const interCompanyDelayMs = relayInterCompanyDelayMs();
  let companiesPulled = 0;

  for (const { id: operatingCompanyId, code: entityCode } of companyIds) {
    if (opts?.operatingCompanyIds && !opts.operatingCompanyIds.includes(operatingCompanyId)) continue;
    const flagOn = await withLuciaBypass(async (client) =>
      isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: operatingCompanyId })
    );
    if (!flagOn) continue;

    if (companiesPulled > 0 && interCompanyDelayMs > 0) {
      await new Promise((r) => setTimeout(r, interCompanyDelayMs));
    }
    companiesPulled += 1;

    const logId = await withLuciaBypass(async (client) => claimRelayTick(client, operatingCompanyId));
    if (logId === null) {
      app.log.info({ operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] tick already claimed by another instance — skipped");
      continue;
    }
    const lastEnd = await withLuciaBypass(async (client) => lastCoveredEndDate(client, operatingCompanyId));
    const window = computeRelayIngestWindow(lastEnd, yesterday);
    try {
      let pulled = 0;
      let upserted = 0;
      let skipped = 0;
      // Server-side date filter via dtstart/dtend, chunked like the backfill so a catch-up never
      // exceeds the per-request timeout. Client-side filter stays as the defensive fallback.
      for (const chunk of dayWindows(window.startDate, window.endDate, relayIngestWindowDays())) {
        const { rows: apiRows, meta } = await fetchAllRelayFuelTransactions(entityCode, {
          startDate: chunk.startDate,
          endDate: chunk.endDate,
        });
        const windowRows = filterRelayFuelTransactionsByDateRange(apiRows, chunk.startDate, chunk.endDate);
        app.log.info(
          {
            operating_company_id: operatingCompanyId,
            entity_code: entityCode,
            api_rows: meta.api_row_count,
            window_rows: windowRows.length,
            window: `${chunk.startDate}..${chunk.endDate}`,
            window_reason: window.reason,
          },
          "[RELAY_FUEL_INGEST_CRON] relay pull complete"
        );
        const stats = await withLuciaBypass(async (client) =>
          ingestForCompany(client, app, operatingCompanyId, chunk.startDate, chunk.endDate, entityCode, {
            preloaded: windowRows,
          })
        );
        pendingGlPosts.push(...stats.gl_post_candidates);
        pulled += stats.pulled;
        upserted += stats.upserted;
        skipped += stats.skipped;
      }
      await withLuciaBypass(async (client) =>
        finishRelayTick(client, logId, {
          success: true,
          rowsAdded: upserted,
          error: null,
          payload: { start_date: window.startDate, end_date: window.endDate, window_reason: window.reason, last_covered_end: lastEnd, pulled, upserted, skipped, entity_code: entityCode },
        })
      );
      app.log.info(
        { operating_company_id: operatingCompanyId, window: `${window.startDate}..${window.endDate}`, pulled, upserted, skipped },
        "[RELAY_FUEL_INGEST_CRON] run complete"
      );
    } catch (error) {
      app.log.error({ err: error, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] company ingest failed");
      failures.push({ operating_company_id: operatingCompanyId, error });
      await withLuciaBypass(async (client) =>
        finishRelayTick(client, logId, {
          success: false,
          rowsAdded: 0,
          error: String((error as Error)?.message ?? error),
          payload: { start_date: window.startDate, end_date: window.endDate, window_reason: window.reason, last_covered_end: lastEnd, entity_code: entityCode },
        })
      ).catch((logErr) => app.log.warn({ err: logErr, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] sync-log finish failed"));
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
}

export function initializeRelayFuelIngestCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.RELAY_FUEL_INGEST_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Relay fuel ingest cron disabled via RELAY_FUEL_INGEST_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 7 * * *", // 07:00 America/Chicago daily — resumes from the last covered day (E-20)
    async () => runRelayFuelIngestTick(app),
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
