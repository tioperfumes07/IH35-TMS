// ROUND 260 Part H — permanent fix for the silent "held expense, blank hold reason, no retry path"
// gap. See tour-close-posting.service.ts's retryHeldExpensePostings for the full root cause: a
// create-time PostingEngineError leaves an expense status='draft'/posting_status='unposted' with
// posting_hold_reason left NULL, and postHeldDocumentsForClosedTour only ever re-checks rows whose
// hold reason is the literal string 'tour_open' -- a blank-hold-reason row is never retried again by
// anything. This cron runs the general sweep periodically so a newly-closed tour, a newly-fixed
// account mapping, or a flag that just flipped on picks up every eligible held expense without
// waiting on a settlement-close event that may never fire for that specific load again.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { retryHeldExpensePostings } from "../accounting/tour-close-posting.service.js";
import { listActiveOperatingCompanyIds } from "./depreciation-autopost.cron.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";

const CRON_NAME = "accounting.retry_held_expense_postings";
const CRON_EXPRESSION = "20 */6 * * *";
const CRON_TZ = "America/Chicago";
// Canonical system actor (lib/system-actor.ts) — the old default id does not exist in identity.users.
const SYSTEM_ACTOR_ID = SYSTEM_ACTOR_USER_ID;

let initialized = false;

export async function runRetryHeldExpensePostingsCronTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  retryHeldExpensePostingsImpl?: typeof retryHeldExpensePostings;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const retryImpl = deps?.retryHeldExpensePostingsImpl ?? retryHeldExpensePostings;

  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));
  const summary = { company_count: companyIds.length, posted: 0, still_held_orphan: 0, still_held_posting_error: 0, flag_off: 0 };

  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    const result = await retryImpl(operatingCompanyId, { userId: SYSTEM_ACTOR_ID });
    for (const o of result.outcomes) {
      if (o.outcome === "posted") summary.posted += 1;
      else if (o.outcome === "still_held_orphan") summary.still_held_orphan += 1;
      else if (o.outcome === "still_held_posting_error") summary.still_held_posting_error += 1;
      else summary.flag_off += 1;
    }
  }

  return summary;
}

export function initializeRetryHeldExpensePostingsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runRetryHeldExpensePostingsCronTick();
          app.log.info(summary, "retry held expense postings cron completed");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Retry held expense postings cron scheduled (every 6h; flag-gated via EXPENSE_GL_POSTING_ENABLED)");
}
