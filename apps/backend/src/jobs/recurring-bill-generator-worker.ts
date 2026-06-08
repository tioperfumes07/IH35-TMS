/**
 * GAP-20 — Recurring Bill Generator Worker
 *
 * Runs daily at 06:00 CT. Processes all recurring_bill_templates
 * with next_generation_date <= today.
 *
 * Uses lucia bypass for cross-tenant iteration.
 */

import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { runRecurringBillGeneratorTick } from "../accounting/bills/recurring/generator.service.js";

const WORKER_NAME = "accounting.recurring_bill_generator";
const CT_ZONE = "America/Chicago";

let timer: NodeJS.Timeout | undefined;

/** System actor UUID for cron-initiated bills. Falls back to lucia bypass. */
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-0000-0000-000000000001";

function msUntilNext0600CT(): number {
  const now = DateTime.now().setZone(CT_ZONE);
  let next = now.set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
  if (now >= next) {
    next = next.plus({ days: 1 });
  }
  return next.diff(now).toMillis();
}

async function tick(app: FastifyInstance) {
  const today = DateTime.now().setZone(CT_ZONE).toISODate()!;
  app.log.info({ today }, `[${WORKER_NAME}] starting tick`);

  try {
    const summary = await runRecurringBillGeneratorTick(SYSTEM_ACTOR_ID, today);
    app.log.info({ summary }, `[${WORKER_NAME}] tick complete`);

    if (summary.failed > 0) {
      app.log.error({ errors: summary.errors }, `[${WORKER_NAME}] ${summary.failed} templates failed`);
    }
  } catch (err) {
    app.log.error({ err }, `[${WORKER_NAME}] tick threw`);
  }
}

function scheduleNextRun(app: FastifyInstance) {
  const ms = msUntilNext0600CT();
  app.log.info({ nextRunMs: ms }, `[${WORKER_NAME}] scheduling next run`);
  timer = setTimeout(() => {
    void tick(app).finally(() => scheduleNextRun(app));
  }, ms);
}

export function initializeRecurringBillGeneratorWorker(app: FastifyInstance) {
  // Schedule first run at next 06:00 CT
  scheduleNextRun(app);
  app.log.info(`[${WORKER_NAME}] initialized — first run at next 06:00 CT`);
}

export function stopRecurringBillGeneratorWorker() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
