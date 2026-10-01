/**
 * ROUND 306 E-30 addition — every 15 min (America/Chicago): templated prompts for fence entries of the last
 * 30 minutes (idempotent per fence event), then each new prompt is delivered to Samsara after commit.
 * Not scheduled unless DRIVER_PROMPTS_ENABLED=true. USMCA only (standing rule 1).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../../auth/db.js";
import { deliverChatMessageAfterCommit } from "./driver-message-delivery.service.js";
import { driverPromptsEnabled, postDriverPromptsForRecentFenceEvents } from "./driver-prompts.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
let initialized = false;

export function initializeDriverPromptsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (!driverPromptsEnabled()) {
    app.log.info("driver prompts cron not scheduled: DRIVER_PROMPTS_ENABLED is not true");
    return;
  }
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const out = await withLuciaBypass(async (client) => {
          // membership-scope-exempt: USMCA-only worker
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
          return postDriverPromptsForRecentFenceEvents(client as never, USMCA, new Date(Date.now() - 30 * 60_000).toISOString());
        });
        for (const id of out.posted) {
          await deliverChatMessageAfterCommit(USMCA, id).catch((err: unknown) => app.log.error({ err }, "driver_prompt_samsara_delivery_failed"));
        }
        app.log.info({ posted: out.posted.length, skipped: out.skipped }, "driver prompts tick");
      } catch (error) {
        app.log.error({ err: error }, "[DRIVER_PROMPTS_CRON] tick failed");
        throw error;
      }
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("driver prompts cron scheduled (every 15 min, America/Chicago)");
}
