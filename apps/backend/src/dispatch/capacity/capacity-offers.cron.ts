/**
 * ENGINE: capacity truck-offer emails (morning digest 07:00 CT + change alert 12:30 CT)
 * SCHEDULE: 0 7 * * * and 30 12 * * * (America/Chicago)
 * WRITES: dispatch.capacity_offer_sends, email.email_queue
 * IDEMPOTENCY: UNIQUE(operating_company_id, lower(email), send_date, kind) claimed with ON CONFLICT DO NOTHING before the
 *   email is queued — at most one morning + one change email per recipient per Central day (hard cap 2).
 * OVERLAP: leaseSeconds = JOB_LEASE_SECONDS — single-fire across instances; a second run claims 0 rows and queues nothing.
 * GATE: only companies whose "Send truck offers" switch (dispatch.capacity_settings.send_truck_offers) is ON. Created OFF;
 *   the owner turns it on. With it off the tick records success and sends nothing.
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../../lib/background-jobs.js";
import { filterLiveEngineCompanyRows } from "../../lib/live-engine-companies.js";
import { runCapacityOffers, type OfferKind } from "./capacity-offers.service.js";

export const CAPACITY_OFFERS_MORNING_JOB = "dispatch.capacity_offers_morning";
export const CAPACITY_OFFERS_CHANGE_JOB = "dispatch.capacity_offers_change";

let initialized = false;

export async function runCapacityOffersCronTick(kind: OfferKind, log?: FastifyInstance["log"]) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT s.operating_company_id::text AS id
         FROM dispatch.capacity_settings s
         JOIN org.companies c ON c.id = s.operating_company_id AND c.deactivated_at IS NULL
        WHERE s.send_truck_offers = true
        ORDER BY 1`
    );
    for (const company of filterLiveEngineCompanyRows(companies.rows)) {
      assertTenantContext(String(company.id ?? ""), `dispatch.capacity_offers_${kind}`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const result = await runCapacityOffers(client, company.id, kind, new Date());
      log?.info({ operating_company_id: company.id, kind, result }, "[capacity-offers] tick");
    }
  });
}

export function initializeCapacityOffersCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    "0 7 * * *",
    async () => {
      await wrapBackgroundJobTick(CAPACITY_OFFERS_MORNING_JOB, () => runCapacityOffersCronTick("morning", app.log), app.log, {
        leaseSeconds: JOB_LEASE_SECONDS,
      });
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  cron.schedule(
    "30 12 * * *",
    async () => {
      await wrapBackgroundJobTick(CAPACITY_OFFERS_CHANGE_JOB, () => runCapacityOffersCronTick("change", app.log), app.log, {
        leaseSeconds: JOB_LEASE_SECONDS,
      });
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Capacity offers cron scheduled (07:00 morning digest + 12:30 change alert, America/Chicago; gated by Send truck offers switch)");
}
