/**
 * ROW-73 (443.279-CC1) — driver pay accrual sweep cron.
 *
 * Runs at boot and every 15 minutes. Finds all driver bills with due_date_basis='delivered'
 * and accrued_bill_id IS NULL (missed by the inline delivery latch) and accrues them.
 * Records outcomes in _system.background_jobs via wrapBackgroundJobTick.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { DRIVER_PAY_ACCRUAL_SWEEP_JOB, runDriverPayAccrualSweep } from "./driver-pay-accrual-sweep.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_EXPRESSION = "*/15 * * * *";
const CRON_TZ = "America/Chicago";

async function runSweep(app: FastifyInstance): Promise<void> {
  await wrapBackgroundJobTick(
    DRIVER_PAY_ACCRUAL_SWEEP_JOB,
    async () => {
      const result = await runDriverPayAccrualSweep(USMCA_COMPANY_ID);
      if (result.accrued > 0 || result.failed > 0) {
        app.log.info(
          { ...result, job: DRIVER_PAY_ACCRUAL_SWEEP_JOB },
          `[driver-pay-accrual-sweep] checked=${result.checked} accrued=${result.accrued} failed=${result.failed}`
        );
      }
      if (result.failed > 0) {
        throw new Error(
          `driver-pay-accrual-sweep: ${result.failed} bill(s) failed to accrue — ${result.errors.map((e) => `${e.load_id}: ${e.error}`).join("; ")}`
        );
      }
    },
    app.log,
    { leaseSeconds: 600 }
  );
}

export function initializeDriverPayAccrualSweepCron(app: FastifyInstance): void {
  // Boot sweep — runs once immediately; records to _system.background_jobs.
  void runSweep(app).catch((err) =>
    app.log.error({ err }, "[driver-pay-accrual-sweep] boot sweep failed")
  );

  // Every 15 min thereafter.
  cron.schedule(
    CRON_EXPRESSION,
    () => {
      void runSweep(app).catch((err) =>
        app.log.error({ err }, "[driver-pay-accrual-sweep] cron tick failed")
      );
    },
    { timezone: CRON_TZ }
  );
}
