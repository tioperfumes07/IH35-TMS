import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { LOVES_CARD_IMPORT_JOB, runLovesCardImportTick } from "../sync/loves-card-import.js";

let initialized = false;
const CRON_EXPRESSION = "0 6 * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = LOVES_CARD_IMPORT_JOB;

export function initializeLovesCardImportCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.LOVES_CARD_IMPORT_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Loves card import cron disabled via LOVES_CARD_IMPORT_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runLovesCardImportTick();
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Loves card import cron scheduled (daily 06:00 America/Chicago)");
}
