/**
 * Relay fuel pull over a date range as a SEQUENCE of dated windows — the only way the daily tick and the
 * history backfill reach Relay.
 *
 * Relay (relayed by the Lead 2026-10-03): "You can filter by date range by using the dtstart and dtend. You can
 * pull all history via the API." and "We have a 10 second limit on pulling transactions and thats the only limit
 * we have." Which limit that is has not been confirmed, so this honours BOTH readings:
 *   - a minimum interval between calls: every HTTP call (each window, each page, each retry) waits until the
 *     previous call finished at least RELAY_MIN_CALL_INTERVAL_MS (floor 10s) ago;
 *   - a ~10s server-side budget per call: each call gets a short client budget (RELAY_WINDOW_CALL_TIMEOUT_MS,
 *     default 15s = Relay's 10s plus transfer headroom), and a window that times out (client abort, 408, 5xx) is
 *     HALVED and retried, down to 1 day; a 1-day window that still times out fails the pull loudly.
 * A 429 retries the same window (Retry-After honoured, never sooner than the pacer) a bounded number of times.
 * Everything else (auth, 4xx, relay_not_configured) throws at once.
 *
 * Re-reading a window is safe: the ingest upserts on (operating_company_id, transaction_id).
 */
import {
  fetchAllRelayFuelTransactions,
  RelayApiError,
  retryAfterMsFromRelayError,
  type RelayCallPacer,
  type RelayFuelTransaction,
  type RelayRejectedRow,
} from "./relay-client.js";

/** Floor for the gap between two Relay calls — Relay's "10 second limit", read as an interval. */
export const RELAY_MIN_CALL_INTERVAL_FLOOR_MS = 10_000;
/** Same-window retries on a 429 before the pull gives up. */
export const RELAY_WINDOW_MAX_RATE_LIMIT_RETRIES = 3;

export function relayMinCallIntervalMs(): number {
  const raw = Number.parseInt(process.env.RELAY_MIN_CALL_INTERVAL_MS ?? "", 10);
  return Number.isFinite(raw) && raw > RELAY_MIN_CALL_INTERVAL_FLOOR_MS ? raw : RELAY_MIN_CALL_INTERVAL_FLOOR_MS;
}

/** Per-call client budget for a windowed call. Relay's server-side limit (if that is the reading) is 10s;
 *  15s lets its own answer arrive, then we abort and halve. Clamped downstream to relayApiTimeoutMs(). */
export function relayWindowCallTimeoutMs(): number {
  const raw = Number.parseInt(process.env.RELAY_WINDOW_CALL_TIMEOUT_MS ?? "15000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
}

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Pacer: the next call starts no sooner than `minIntervalMs` after the previous call FINISHED. */
export function createRelayCallPacer(minIntervalMs: number, clock: Clock = realClock): RelayCallPacer & { calls: () => number } {
  let lastFinishedAt: number | null = null;
  let calls = 0;
  return {
    async beforeCall() {
      if (lastFinishedAt !== null) {
        const wait = lastFinishedAt + minIntervalMs - clock.now();
        if (wait > 0) await clock.sleep(wait);
      }
      calls += 1;
    },
    afterCall() {
      lastFinishedAt = clock.now();
    },
    calls: () => calls,
  };
}

/** A failure that a SMALLER window could cure: client abort / network error, 408, or any 5xx. */
export function isRelayTimeoutClassError(error: unknown): boolean {
  if (!(error instanceof RelayApiError)) return false;
  if (error.statusCode === null) return error.retryable; // relay_network_error (abort / reset / breaker)
  return error.statusCode === 408 || error.statusCode >= 500;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

export type RelayWindow = { startDate: string; endDate: string };

export type RelayWindowedPullSummary = {
  windows: number;
  calls: number;
  halvings: number;
  rows: number;
  rejected: RelayRejectedRow[];
};

type FetchWindow = (
  entityCode: string | null,
  opts: { startDate: string; endDate: string; timeoutMs: number; maxRetries: number; pacer: RelayCallPacer }
) => ReturnType<typeof fetchAllRelayFuelTransactions>;

/**
 * Walk [startDate, endDate] oldest -> newest in windows of `windowDays`, one paced Relay call (per page) each,
 * handing every window's rows to `onWindow` before the next call (so the caller commits progress per window and
 * keeps network I/O out of its DB transaction). A halved window grows back (x2, up to windowDays) after a success.
 */
export async function fetchRelayFuelTransactionsInWindows(
  entityCode: string | null,
  params: {
    startDate: string;
    endDate: string;
    windowDays: number;
    onWindow: (
      window: RelayWindow,
      rows: RelayFuelTransaction[],
      meta: { rejected: RelayRejectedRow[]; pages_fetched: number }
    ) => Promise<void>;
  },
  deps: { fetchWindow?: FetchWindow; clock?: Clock; minIntervalMs?: number; callTimeoutMs?: number } = {}
): Promise<RelayWindowedPullSummary> {
  const fetchWindow: FetchWindow = deps.fetchWindow ?? fetchAllRelayFuelTransactions;
  const clock = deps.clock ?? realClock;
  const minIntervalMs = Math.max(RELAY_MIN_CALL_INTERVAL_FLOOR_MS, deps.minIntervalMs ?? relayMinCallIntervalMs());
  const callTimeoutMs = deps.callTimeoutMs ?? relayWindowCallTimeoutMs();
  const pacer = createRelayCallPacer(minIntervalMs, clock);
  const fullSize = Math.max(1, Math.floor(params.windowDays));

  const summary: RelayWindowedPullSummary = { windows: 0, calls: 0, halvings: 0, rows: 0, rejected: [] };
  let cursor = params.startDate;
  let size = fullSize;
  let rateLimitedRetries = 0;

  while (cursor <= params.endDate) {
    const window: RelayWindow = { startDate: cursor, endDate: minIso(addDays(cursor, size - 1), params.endDate) };
    const windowDays = Math.round((Date.parse(`${window.endDate}T00:00:00Z`) - Date.parse(`${cursor}T00:00:00Z`)) / 86_400_000) + 1;
    let result: Awaited<ReturnType<FetchWindow>>;
    try {
      result = await fetchWindow(entityCode, { ...window, timeoutMs: callTimeoutMs, maxRetries: 0, pacer });
    } catch (error) {
      if (error instanceof RelayApiError && error.statusCode === 429 && rateLimitedRetries < RELAY_WINDOW_MAX_RATE_LIMIT_RETRIES) {
        rateLimitedRetries += 1;
        // A Retry-After longer than the pacer interval is waited out in full; a shorter one is covered by the pacer.
        const retryAfterMs = retryAfterMsFromRelayError(error) ?? 0;
        if (retryAfterMs > minIntervalMs) await clock.sleep(retryAfterMs);
        continue;
      }
      if (isRelayTimeoutClassError(error)) {
        if (windowDays > 1) {
          size = Math.ceil(windowDays / 2);
          summary.halvings += 1;
          continue;
        }
        throw new RelayApiError(
          `relay_window_timeout_at_min_window:${window.startDate}..${window.endDate} still failed at 1 day (${(error as Error).message})`,
          (error as RelayApiError).statusCode,
          (error as RelayApiError).body,
          false
        );
      }
      throw error;
    }
    rateLimitedRetries = 0;
    summary.windows += 1;
    summary.rows += result.rows.length;
    summary.rejected.push(...result.meta.rejected);
    await params.onWindow(window, result.rows, { rejected: result.meta.rejected, pages_fetched: result.meta.pages_fetched });
    cursor = addDays(window.endDate, 1);
    size = Math.min(fullSize, size * 2);
  }
  summary.calls = pacer.calls();
  return summary;
}
