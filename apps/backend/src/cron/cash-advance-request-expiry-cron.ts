import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { expireStaleCashAdvanceRequests } from "../driver-finance/cash-advance-requests.service.js";

let initialized = false;

/**
 * Marks driver-submitted cash advance requests as expired when past expires_at (pending / under_review only).
 */
export function initializeCashAdvanceRequestExpiryCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON === "false") {
    app.log.info("Cash advance request expiry cron disabled via ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON=false");
    return;
  }

  cron.schedule(
    "15 6 * * *",
    async () => {
      try {
        const expired = await withLuciaBypass(async (client) => expireStaleCashAdvanceRequests(client));
        if (expired.length > 0) {
          app.log.info({ count: expired.length }, "cash_advance_requests expired by cron");
        }
      } catch (err) {
        app.log.error({ err }, "cash_advance_request expiry cron failed");
      }
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Cash advance request expiry cron scheduled (daily 06:15 America/Chicago)");
}
