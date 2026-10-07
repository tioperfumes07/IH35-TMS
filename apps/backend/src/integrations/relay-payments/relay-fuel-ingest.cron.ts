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
  filterRelayFuelTransactionsByDateRange,
  listRelayFuelTransactions,
  parseRelayFuelTransactionRow,
  type RelayFuelTransaction,
  type RelayRejectedRow,
  RelayApiError,
  RelayRowRejectedError,
} from "./relay-client.js";
import { upsertRelayFuelTransaction, type RelayIngestSource } from "./relay-fuel-ingest.service.js";
import { computeRelayIngestWindow } from "./relay-fuel-ingest-window.js";
import { fetchRelayFuelTransactionsInWindows } from "./relay-fuel-windowed-pull.js";

const RELAY_SYNC_KIND = "relay_fuel_daily_pull";

/** RELAY-F440 — a claim with no finish older than this is a run that died, never a run in flight. */
export const RELAY_CLAIM_STALE_MINUTES = 30;

/**
 * ROUND 306 E-20 — claim this company's tick in integrations.integration_sync_log under an advisory
 * lock. The backend runs 2 instances and each fires this cron, so every company was pulled twice a
 * day. The first instance claims; the second skips.
 *
 * RELAY-F440 — the skip is for a CONCURRENT instance only: a claim still open (finished_at IS NULL) and younger than
 * RELAY_CLAIM_STALE_MINUTES, or one that finished successfully within that time. An open claim OLDER than that is a run
 * that died without recording why; it is closed here as success=false with the reason, and this instance claims.
 */
async function claimRelayTick(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('relay_fuel_ingest:' || $1))`, [operatingCompanyId]);
  await client.query(
    `UPDATE integrations.integration_sync_log
        SET finished_at = now(), success = false,
            error_message = 'abandoned: no completion recorded within ' || $3::text || ' minutes (the run died or was killed)'
      WHERE operating_company_id = $1::uuid AND integration = 'relay' AND sync_kind = $2
        AND finished_at IS NULL AND started_at <= now() - make_interval(mins => $3::int)`,
    [operatingCompanyId, RELAY_SYNC_KIND, RELAY_CLAIM_STALE_MINUTES]
  );
  const recent = await client.query<{ id: string }>(
    `SELECT id::text FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'relay' AND sync_kind = $2
        AND started_at > now() - make_interval(mins => $3::int)
        AND (finished_at IS NULL OR success = true)
      LIMIT 1`,
    [operatingCompanyId, RELAY_SYNC_KIND, RELAY_CLAIM_STALE_MINUTES]
  );
  if (recent.rows.length > 0) return null;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO integrations.integration_sync_log (operating_company_id, integration, sync_kind)
     VALUES ($1::uuid, 'relay', $2) RETURNING id::text`,
    [operatingCompanyId, RELAY_SYNC_KIND]
  );
  return ins.rows[0]?.id ?? null;
}

/**
 * End date of this company's last SUCCESSFUL tick — the sync log, or the older audit trail. RELAY-F440: when neither
 * has one, the newest fill already stored (integrations.relay_fuel_transactions.relay_created_at) is the watermark, so
 * the window self-heals even if no tick has ever been recorded as successful.
 */
async function lastCoveredEndDate(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ end_date: string | null }>(
    `SELECT COALESCE(
       (SELECT max(d) FROM (
          SELECT (payload->>'end_date')::date AS d FROM integrations.integration_sync_log
           WHERE operating_company_id = $1::uuid AND integration = 'relay' AND sync_kind = $2 AND success = true
          UNION ALL
          SELECT (payload->>'end_date')::date FROM audit.audit_events
           WHERE source = $3 AND event_class = 'integrations.relay_fuel_ingest_daily_pull'
             AND payload->>'operating_company_id' = $1::text
        ) t),
       (SELECT max(relay_created_at)::date FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid)
     )::text AS end_date`,
    [operatingCompanyId, RELAY_SYNC_KIND, RELAY_FUEL_INGEST_AUDIT_SOURCE]
  );
  return res.rows[0]?.end_date ?? null;
}

async function finishRelayTick(
  client: DbClient,
  logId: string,
  outcome: { success: boolean; rowsAdded: number; error: string | null; payload: Record<string, unknown> }
): Promise<void> {
  // RELAY-F440 — an UPDATE that matches no row does not raise (row-level security without an UPDATE policy did exactly
  // that for every tick). RETURNING makes "0 rows" visible, and it is refused by name instead of passing silently.
  const res = await client.query<{ id: string }>(
    `UPDATE integrations.integration_sync_log
        SET finished_at = now(), success = $2, rows_added = $3, error_message = $4, payload = $5::jsonb
      WHERE id = $1::uuid
      RETURNING id::text`,
    [logId, outcome.success, outcome.rowsAdded, outcome.error, JSON.stringify(outcome.payload)]
  );
  if (res.rows.length !== 1) throw new Error(`relay_sync_log_finish_matched_${res.rows.length}_rows:${logId}`);
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

/** Daily-tick window size in days (owner directive 2026-07-15 kept the 3-day granularity). Each window is
 *  ONE dated Relay call (`dtstart`/`dtend`) and one DB commit + audit row.
 *  Configurable via RELAY_FUEL_INGEST_WINDOW_DAYS; default 3. */
function relayIngestWindowDays(): number {
  const raw = Number.parseInt(process.env.RELAY_FUEL_INGEST_WINDOW_DAYS ?? "3", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

/** History-backfill window size in days — one dated Relay call per window, >=10s apart, halved on a timeout.
 *  Configurable via RELAY_FUEL_BACKFILL_WINDOW_DAYS; default 7. */
function relayBackfillWindowDays(): number {
  const raw = Number.parseInt(process.env.RELAY_FUEL_BACKFILL_WINDOW_DAYS ?? "7", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

/** Mike (Relay, 2026-07-16): "We have a 10 second limit on pulling transactions" — min gap between pulls. */
function relayInterCompanyDelayMs(): number {
  const raw = Number.parseInt(process.env.RELAY_FUEL_INGEST_INTER_COMPANY_MS ?? "10000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10000;
}

/**
 * Inclusive, contiguous [startDate,endDate] windows of `windowDays` each covering [startIso, endIso],
 * oldest→newest, with NO gaps and NO overlaps (each window's end is the day before the next window's start).
 * The fixed-size reference split; the live pull (fetchRelayFuelTransactionsInWindows) walks the same contiguous
 * shape but may halve a window that times out. The upsert is idempotent by transaction_id, so a boundary or
 * re-run never duplicates.
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
  opts?: {
    preloaded?: RelayFuelTransaction[];
    source?: RelayIngestSource;
    /** Rows the pull already refused (relay-client parse) — recorded with this batch, never stored. */
    rejected?: RelayRejectedRow[];
  }
): Promise<{
  pulled: number;
  upserted: number;
  skipped: number;
  rejected: RelayRejectedRow[];
  gl_post_candidates: FuelTxnGlPostCandidate[];
}> {
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
  const rejected: RelayRejectedRow[] = [...(opts?.rejected ?? [])];
  const driverUnresolved: Record<string, number> = {};
  const gl_post_candidates: FuelTxnGlPostCandidate[] = [];

  for (const rawRow of rawRows) {
    // The webhook hands raw rows straight here, so this parse is the money gate for pushed fills too.
    let parsed: RelayFuelTransaction | null;
    try {
      parsed = parseRelayFuelTransactionRow(rawRow);
    } catch (error) {
      if (!(error instanceof RelayRowRejectedError)) throw error;
      rejected.push({ transaction_id: error.transactionId, field: error.field, reason: error.reason });
      app.log.error(
        { operating_company_id: operatingCompanyId, transaction_id: error.transactionId, field: error.field, reason: error.reason },
        "[RELAY_FUEL_INGEST_CRON] row rejected — money field not in the accepted shape; nothing stored"
      );
      continue;
    }
    if (!parsed) {
      skipped += 1;
      app.log.warn(
        { operating_company_id: operatingCompanyId, raw_transaction_id: rawRow.transaction_id },
        "[RELAY_FUEL_INGEST_CRON] skipped unparsable row"
      );
      continue;
    }
    const result = await upsertRelayFuelTransaction(client, operatingCompanyId, parsed, opts?.source ?? "daily_pull");
    if (result.skipped_reason) {
      // One fill = one company: another company owns (or already holds) this fill — nothing written here.
      skipped += 1;
      continue;
    }
    upserted += 1;
    if (result.gl_post_candidate) gl_post_candidates.push(result.gl_post_candidate);
    if (result.driver_unresolved_reason) {
      driverUnresolved[result.driver_unresolved_reason] = (driverUnresolved[result.driver_unresolved_reason] ?? 0) + 1;
    }
    if (!result.matched_driver_id || !result.matched_unit_id) {
      app.log.info(
        {
          operating_company_id: operatingCompanyId,
          transaction_id: result.transaction_id,
          matched_driver_id: result.matched_driver_id,
          driver_unresolved_reason: result.driver_unresolved_reason,
          matched_unit_id: result.matched_unit_id,
        },
        "[RELAY_FUEL_INGEST_CRON] transaction ingested with an unresolved driver or unit match"
      );
    }
  }

  const source = opts?.source ?? "daily_pull";
  const baseClass = source === "daily_pull" ? "integrations.relay_fuel_ingest_daily_pull" : `integrations.relay_fuel_ingest_${source}`;
  // A batch with refused rows is NOT recorded under the plain class: lastCoveredEndDate reads that class as
  // "this window is covered", and a window holding an unstored fill is not.
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    rejected.length > 0 ? `${baseClass}_with_rejected_rows` : baseClass,
    rejected.length > 0 ? "warning" : "info",
    JSON.stringify({
      operating_company_id: operatingCompanyId,
      source,
      start_date: startDate,
      end_date: endDate,
      pulled: rawRows.length,
      upserted,
      skipped,
      rejected: rejected.length,
      rejected_rows: rejected.slice(0, 50),
      driver_unresolved: driverUnresolved,
    }),
    RELAY_FUEL_INGEST_AUDIT_SOURCE,
  ]);

  return { pulled: rawRows.length, upserted, skipped, rejected, gl_post_candidates };
}

/** Thrown after a pull has stored every good row, when any row was refused — the tick / backfill is then
 *  recorded as FAILED (so the window is re-read next run) and the aggregated error reaches Sentry. */
function relayRejectedRowsError(rejected: RelayRejectedRow[], startDate: string, endDate: string): RelayApiError {
  return new RelayApiError(
    `relay_rows_rejected:${rejected.length} row(s) in ${startDate}..${endDate} refused (money field not a dollar string); first: ${rejected[0]?.reason ?? "?"}`,
    null,
    rejected.slice(0, 50),
    false
  );
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
    // RELAY-F440 — everything after the claim runs inside the try, and the claim is closed exactly once in `finally`:
    // success=true with the window, or success=false with the error. A tick that dies records that it died and why.
    let lastEnd: string | null = null;
    let window: ReturnType<typeof computeRelayIngestWindow> | null = null;
    let outcome: { success: boolean; rowsAdded: number; error: string | null; payload: Record<string, unknown> } | null = null;
    try {
      lastEnd = await withLuciaBypass(async (client) => lastCoveredEndDate(client, operatingCompanyId));
      window = computeRelayIngestWindow(lastEnd, yesterday);
      const tickWindow = window;
      let pulled = 0;
      let upserted = 0;
      let skipped = 0;
      const rejected: RelayRejectedRow[] = [];
      // Server-side date filter via dtstart/dtend, one paced call per window (>=10s apart, halved on a
      // timeout) so a catch-up never becomes one long call. Client-side filter stays as the defensive fallback.
      const pull = await fetchRelayFuelTransactionsInWindows(entityCode, {
        startDate: tickWindow.startDate,
        endDate: tickWindow.endDate,
        windowDays: relayIngestWindowDays(),
        onWindow: async (chunk, apiRows, meta) => {
          const windowRows = filterRelayFuelTransactionsByDateRange(apiRows, chunk.startDate, chunk.endDate);
          app.log.info(
            {
              operating_company_id: operatingCompanyId,
              entity_code: entityCode,
              api_rows: apiRows.length,
              window_rows: windowRows.length,
              rejected_rows: meta.rejected.length,
              window: `${chunk.startDate}..${chunk.endDate}`,
              window_reason: tickWindow.reason,
            },
            "[RELAY_FUEL_INGEST_CRON] relay pull complete"
          );
          const stats = await withLuciaBypass(async (client) =>
            ingestForCompany(client, app, operatingCompanyId, chunk.startDate, chunk.endDate, entityCode, {
              preloaded: windowRows,
              rejected: meta.rejected,
            })
          );
          pendingGlPosts.push(...stats.gl_post_candidates);
          pulled += stats.pulled;
          upserted += stats.upserted;
          skipped += stats.skipped;
          rejected.push(...stats.rejected);
        },
      });
      // Good rows are stored; a refused row fails the tick so the sync log does not mark the window covered.
      if (rejected.length > 0) throw relayRejectedRowsError(rejected, tickWindow.startDate, tickWindow.endDate);
      outcome = {
        success: true,
        rowsAdded: upserted,
        error: null,
        payload: {
          start_date: tickWindow.startDate,
          end_date: tickWindow.endDate,
          window_reason: tickWindow.reason,
          last_covered_end: lastEnd,
          pulled,
          upserted,
          skipped,
          relay_calls: pull.calls,
          window_halvings: pull.halvings,
          entity_code: entityCode,
        },
      };
      app.log.info(
        { operating_company_id: operatingCompanyId, window: `${tickWindow.startDate}..${tickWindow.endDate}`, pulled, upserted, skipped, relay_calls: pull.calls, window_halvings: pull.halvings },
        "[RELAY_FUEL_INGEST_CRON] run complete"
      );
    } catch (error) {
      app.log.error({ err: error, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] company ingest failed");
      failures.push({ operating_company_id: operatingCompanyId, error });
      outcome = {
        success: false,
        rowsAdded: 0,
        error: String((error as Error)?.message ?? error),
        payload: {
          start_date: window?.startDate ?? null,
          end_date: window?.endDate ?? null,
          window_reason: window?.reason ?? null,
          last_covered_end: lastEnd,
          entity_code: entityCode,
        },
      };
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
    } finally {
      const final = outcome ?? {
        success: false,
        rowsAdded: 0,
        error: "relay_tick_ended_without_an_outcome",
        payload: { last_covered_end: lastEnd, entity_code: entityCode },
      };
      try {
        await withLuciaBypass(async (client) => finishRelayTick(client, logId, final));
      } catch (finishErr) {
        // The claim could not be closed: that is itself a failure of this tick, never a log line only.
        app.log.error({ err: finishErr, operating_company_id: operatingCompanyId }, "[RELAY_FUEL_INGEST_CRON] sync-log finish failed");
        failures.push({ operating_company_id: operatingCompanyId, error: finishErr });
      }
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
 * for each active, flag-ON operating company. Default 24 months (RELAY_FUEL_INGEST_BACKFILL_MONTHS), pulled
 * as a SEQUENCE of dated windows (default 7 days, RELAY_FUEL_BACKFILL_WINDOW_DAYS) — never one call for the
 * whole range: each window is its own dtstart/dtend call, >=10s after the previous one, halved on a timeout
 * down to 1 day (fetchRelayFuelTransactionsInWindows). Each window commits on its own, so a failure keeps every
 * earlier window. Idempotent + RESUMABLE (upsert by transaction_id), so a re-run continues rather than
 * duplicating or restarting; Relay returns only what exists, so "24 months or more" naturally yields whatever
 * history is available. Jorge 2026-07-05: "set to maximum past time, 24 months or more if available."
 * At 24 months / 7-day windows that is ~105 calls, so >= ~18 minutes per company by design.
 */
export async function runRelayFuelBackfill(
  app: FastifyInstance,
  opts?: { months?: number; operatingCompanyId?: string; runId?: string }
): Promise<void> {
  const months =
    opts?.months ?? (Number.parseInt(process.env.RELAY_FUEL_INGEST_BACKFILL_MONTHS ?? "24", 10) || 24);
  const windowDays = relayBackfillWindowDays();
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
    const rejected: RelayRejectedRow[] = [];
    try {
      // Server-side date filter via dtstart/dtend (Mike), one paced call per window. Network I/O stays outside
      // the DB transaction; each window's rows commit in their own withLuciaBypass.
      const rangeStart = isoDateMonthsAgo(months);
      const rangeEnd = todayIsoDate();
      const pull = await fetchRelayFuelTransactionsInWindows(entityCode, {
        startDate: rangeStart,
        endDate: rangeEnd,
        windowDays,
        onWindow: async (w, apiRows, meta) => {
          const windowRows = filterRelayFuelTransactionsByDateRange(apiRows, w.startDate, w.endDate);
          const stats = await withLuciaBypass(async (client) =>
            ingestForCompany(client, app, operatingCompanyId, w.startDate, w.endDate, entityCode, {
              preloaded: windowRows,
              rejected: meta.rejected,
            })
          );
          pulled += stats.pulled;
          upserted += stats.upserted;
          skipped += stats.skipped;
          rejected.push(...stats.rejected);
          pendingGlPosts.push(...stats.gl_post_candidates);
          app.log.info(
            {
              operating_company_id: operatingCompanyId,
              window: `${w.startDate}..${w.endDate}`,
              api_rows: apiRows.length,
              pulled: stats.pulled,
              upserted: stats.upserted,
              skipped: stats.skipped,
              rejected: stats.rejected.length,
              gl_post_pending: stats.gl_post_candidates.length,
            },
            "[RELAY_FUEL_INGEST_BACKFILL] window complete"
          );
        },
      });

      if (pull.rows === 0) {
        app.log.warn(
          { operating_company_id: operatingCompanyId, entity_code: entityCode, dtstart: rangeStart, dtend: rangeEnd },
          "[RELAY_FUEL_INGEST_BACKFILL] relay API returned zero transactions for entity — verify key/account with Relay"
        );
      }
      if (rejected.length > 0) throw relayRejectedRowsError(rejected, rangeStart, rangeEnd);

      app.log.info(
        {
          operating_company_id: operatingCompanyId,
          months,
          window_days: windowDays,
          windows: pull.windows,
          relay_calls: pull.calls,
          window_halvings: pull.halvings,
          pulled,
          upserted,
          skipped,
        },
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
