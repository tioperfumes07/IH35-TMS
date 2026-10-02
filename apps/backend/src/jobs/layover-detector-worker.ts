/**
 * ENGINE: layover detector
 * SCHEDULE: every 6 h (setInterval)
 * WRITES: dispatch.driver_layovers
 * IDEMPOTENCY: ADVISORY LOCK pg_advisory_xact_lock per company; savepoint per company
 * OVERLAP: the twin waits, then finds every layover the first wrote
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * GAP-28 — Layover detection worker (every 6h).
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { detectLayovers } from "../dispatch/layovers/detection.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

const WORKER_NAME = "dispatch.layover_detector";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.LAYOVER_DETECTOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  // FAIL LOUD. Three independent silent failures used to make this worker report a healthy
  // `tick complete { total: 0 }` while it had never detected a single layover:
  //   1. `WHERE active = true` — org.companies has NO `active` column (it is `is_active`), so this
  //      threw 42703 and `.catch(() => ({ rows: [] }))` turned it into ZERO companies, every tick.
  //   2. detection.service returned 0 when a prerequisite table was absent.
  //   3. the per-company catch downgraded every real error to a warn.
  // A detector that reports "0 layovers" when it cannot run is indistinguishable from one that works
  // — and layover is DRIVER PAY. Every failure path now surfaces distinctly from a genuine zero.
  const result = await withLuciaBypass(async (client) => {
    // No .catch() swallow: if this query fails, the tick fails and says why.
    const companies = await client.query<{ id: string }>(
      `SELECT id FROM org.companies WHERE is_active = true LIMIT 100`
    );

    let count = 0;
    let resolvable = 0;
    const failures: Array<{ company_id: string; error: string }> = [];
    for (const { id } of companies.rows) {
      // ROUND 330.7: a savepoint per company — one company's SQL error used to leave the shared transaction aborted, so
      // every later company failed too ("current transaction is aborted").
      await client.query("SAVEPOINT layover_company");
      try {
        const r = await detectLayovers(client, id);
        await client.query("RELEASE SAVEPOINT layover_company");
        count += r.inserted;
        resolvable += r.resolvable_deliveries;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT layover_company");
        failures.push({ company_id: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { count, resolvable, scanned: companies.rows.length, failures };
  });

  if (result.scanned === 0) {
    // Distinct from "scanned N companies, found 0 layovers".
    app.log.error({ scanned: 0 }, `[${WORKER_NAME}] DID NOT RUN — zero active companies resolved; this is not "no layovers"`);
    return;
  }
  if (result.failures.length) {
    app.log.error(
      { scanned: result.scanned, failed: result.failures.length, failures: result.failures, detected: result.count },
      `[${WORKER_NAME}] PARTIAL — ${result.failures.length} of ${result.scanned} companies could not be scanned; the detected count is NOT a complete answer`
    );
    return;
  }
  if (result.resolvable === 0) {
    // Ran cleanly, but on nothing. "0 layovers out of 0 evaluable deliveries" is a DATA state, not an
    // answer — say so, or this reads exactly like a healthy zero.
    app.log.warn(
      { scanned: result.scanned, resolvable_deliveries: 0, detected: 0 },
      `[${WORKER_NAME}] NO EVALUABLE DATA — 0 delivered loads had a resolvable release time; "0 layovers" here means "nothing to check", not "none occurred"`
    );
    return;
  }
  app.log.info(
    { scanned: result.scanned, resolvable_deliveries: result.resolvable, detected: result.count },
    `[${WORKER_NAME}] tick complete — ${result.count} layover(s) from ${result.resolvable} evaluable deliveries`
  );
}

export function initializeLayoverDetectorWorker(app: FastifyInstance) {
  const ms = intervalMs();
  // ROUND 330.7: through the shared wrapper (run recorded, failure logged + Sentry) so the single-fire lease reaches it.
  const run = () => wrapBackgroundJobTick(WORKER_NAME, () => tick(app), app.log);
  void run();
  timer = setInterval(() => { void run(); }, ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
  return () => { if (timer) { clearInterval(timer); timer = undefined; } };
}
