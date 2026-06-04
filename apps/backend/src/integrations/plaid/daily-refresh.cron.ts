import type { FastifyInstance } from "fastify";
import {
  initializePlaidDailySyncCron,
  PLAID_DAILY_SYNC_JOB,
} from "../../cron/plaid-daily-sync.js";

export { PLAID_DAILY_SYNC_JOB };

/** P5-T1.3 alias — daily token refresh + transaction pull scheduler. */
export function initializePlaidDailyRefreshCron(app: FastifyInstance) {
  initializePlaidDailySyncCron(app);
}
