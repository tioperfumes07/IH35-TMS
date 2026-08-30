import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runReconciliationCategoryTick } from "../reconciliation/reconciliation-worker.service.js";

let initialized = false;

/**
 * LV-SYSTEM-BACKGROUND-JOBS-STALE-DOWN-REGRESSION — node-cron does not backfill ticks missed while
 * the process was down for a deploy. Hourly jobs with a 120m health window (= two periods) go stale
 * after ~2h of restart churn even though the worker is healthy. On boot, run one catch-up tick for
 * each reconciliation job that is already past its health maxStaleMinutes (same windows as
 * backgroundJobRule in health.routes.ts). Preserve the DOWN signal for genuine ongoing stalls —
 * catch-up only closes deploy-gap false reds; a job that keeps failing still records failure.
 */
export const RECONCILIATION_CATCHUP_WINDOWS: ReadonlyArray<{
  jobName: string;
  maxStaleMinutes: number;
}> = [
  { jobName: "reconciliation.qbo_refdata", maxStaleMinutes: 720 },
  { jobName: "reconciliation.qbo_transactional", maxStaleMinutes: 120 },
  { jobName: "reconciliation.samsara_static", maxStaleMinutes: 1440 },
  { jobName: "reconciliation.cap15_identity", maxStaleMinutes: 120 },
];

export function isReconciliationJobOverdue(
  lastSuccessfulRunAt: string | null | undefined,
  maxStaleMinutes: number,
  nowMs: number = Date.now()
): boolean {
  if (!lastSuccessfulRunAt) return true;
  const parsed = Date.parse(lastSuccessfulRunAt);
  if (Number.isNaN(parsed)) return true;
  const mins = (nowMs - parsed) / 60_000;
  return mins > maxStaleMinutes;
}

async function runCatchupTick(
  app: FastifyInstance,
  jobName: string,
  tick: () => Promise<void>
): Promise<void> {
  app.log.warn({ jobName }, `[reconciliation-catchup] overdue — running one startup tick for ${jobName}`);
  await wrapBackgroundJobTick(jobName, tick, app.log);
}

export async function catchUpOverdueReconciliationTicks(app: FastifyInstance): Promise<void> {
  const ages = new Map<string, string | null>();
  try {
    await withLuciaBypass(async (client) => {
      const reg = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        // CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE: honest signal instead of a bare skip — a fresh/
        // unmigrated DB fails closed (no catch-up runs) rather than silently doing nothing with no
        // trace anywhere that the health-window mechanism could not even check its own ledger.
        app.log.warn("[reconciliation-catchup] _system.background_jobs not available — fails closed, no catch-up");
        return;
      }
      const res = await client.query<{ job_name: string; last_successful_run_at: string | null }>(
        `SELECT job_name, last_successful_run_at
           FROM _system.background_jobs
          WHERE job_name = ANY($1::text[])`,
        [RECONCILIATION_CATCHUP_WINDOWS.map((j) => j.jobName)]
      );
      for (const row of res.rows) {
        ages.set(row.job_name, row.last_successful_run_at);
      }
    });
  } catch (error) {
    app.log.error({ err: error }, "[reconciliation-catchup] age lookup failed — skipping catch-up");
    return;
  }

  const runners: Record<string, () => Promise<void>> = {
    "reconciliation.qbo_refdata": () => runReconciliationCategoryTick("qbo", "refdata_static"),
    "reconciliation.qbo_transactional": () => runReconciliationCategoryTick("qbo", "transactional"),
    "reconciliation.samsara_static": () => runReconciliationCategoryTick("samsara", "refdata_static"),
    "reconciliation.cap15_identity": () => runReconciliationCategoryTick("samsara", "identity_mapping"),
  };

  for (const { jobName, maxStaleMinutes } of RECONCILIATION_CATCHUP_WINDOWS) {
    const last = ages.has(jobName) ? ages.get(jobName) : null;
    // Missing ledger row ⇒ treat as overdue (same as never-succeeded).
    if (!isReconciliationJobOverdue(last ?? null, maxStaleMinutes)) continue;
    const tick = runners[jobName];
    if (!tick) continue;
    try {
      await runCatchupTick(app, jobName, tick);
    } catch (error) {
      // wrapBackgroundJobTick already records failure; keep boot path non-fatal.
      app.log.error({ err: error, jobName }, `[reconciliation-catchup] ${jobName} catch-up threw`);
    }
  }
}

export function initializeReconciliationWorkerCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.RECONCILIATION_WORKER_ENABLED ?? "true").trim() === "false") {
    app.log.info("Reconciliation worker cron disabled via RECONCILIATION_WORKER_ENABLED=false");
    return;
  }

  // DD-3: QBO refdata every 6h.
  cron.schedule(
    "35 */6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "reconciliation.qbo_refdata",
        async () => {
          await runReconciliationCategoryTick("qbo", "refdata_static");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  // DD-3: QBO transactional every 60m.
  cron.schedule(
    "45 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "reconciliation.qbo_transactional",
        async () => {
          await runReconciliationCategoryTick("qbo", "transactional");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  // DD-3: Samsara static every 12h.
  cron.schedule(
    "50 */12 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "reconciliation.samsara_static",
        async () => {
          await runReconciliationCategoryTick("samsara", "refdata_static");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  // DD-4 CAP-15 zero tolerance check on hourly cadence.
  cron.schedule(
    "55 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "reconciliation.cap15_identity",
        async () => {
          await runReconciliationCategoryTick("samsara", "identity_mapping");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Reconciliation worker cron initialized (qbo 6h/1h, samsara 12h, cap15 1h)");

  // Deploy-gap catch-up — fire-and-forget so listen() is not blocked.
  void catchUpOverdueReconciliationTicks(app).catch((error) => {
    app.log.error({ err: error }, "[reconciliation-catchup] unexpected rejection");
  });
}
