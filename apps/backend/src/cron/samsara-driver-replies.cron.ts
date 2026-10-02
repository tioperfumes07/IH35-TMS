/**
 * ENGINE: Samsara driver replies inbound
 * SCHEDULE: *\/5 * * * *
 * WRITES: chat.threads (driver_direct), chat.participants, chat.messages
 * IDEMPOTENCY: ADVISORY LOCK per (company, driver) on direct-thread find-or-create; UNIQUE(thread_id, client_key) ON CONFLICT on messages (client_key samsara-msg:<driver>:<sentAtMs>)
 * OVERLAP: second run finds the thread and dedupes every message
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 313 E-30 — inbound half of driver messaging: every 5 min, read the last 48 h of Samsara messages and post
 * each driver reply into the ONE chat system (driver-message-inbound.service.ts). Idempotent per Samsara message.
 * Runs only with SAMSARA_DRIVER_MESSAGING_ENABLED=true (the same switch as the outbound half).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { samsaraDriverMessagingEnabled } from "../integrations/samsara/messaging/driver-message-delivery.service.js";
import { ingestDriverReplies } from "../integrations/samsara/messaging/driver-message-inbound.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "integrations.samsara_driver_replies";
let initialized = false;

export function initializeSamsaraDriverRepliesCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (!samsaraDriverMessagingEnabled()) {
    app.log.info(`${CRON_NAME} not scheduled: SAMSARA_DRIVER_MESSAGING_ENABLED is not true`);
    return;
  }
  cron.schedule("*/5 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const summary = await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
        const cfg = await getSamsaraConfigForCompany(client as never, USMCA_COMPANY_ID);
        if (!cfg || !cfg.is_enabled) return { skipped: "samsara_not_configured" };
        const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
        return ingestDriverReplies(client as never, USMCA_COMPANY_ID, api, 48);
      });
      app.log.info(summary, `${CRON_NAME} tick`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 20_000 });
  app.log.info(`${CRON_NAME} scheduled (every 5 min)`);
}
