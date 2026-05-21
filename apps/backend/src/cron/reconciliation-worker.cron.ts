import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runReconciliationCategoryTick } from "../reconciliation/reconciliation-worker.service.js";

let initialized = false;

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
    { timezone: "America/Chicago" }
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
    { timezone: "America/Chicago" }
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
    { timezone: "America/Chicago" }
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
    { timezone: "America/Chicago" }
  );

  app.log.info("Reconciliation worker cron initialized (qbo 6h/1h, samsara 12h, cap15 1h)");
}
