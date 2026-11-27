/**
 * SCENTSX B9b — once a day (05:17 America/Chicago) download OFAC's SDN + ALT lists; when the content changed, keep the new load
 * and re-screen every ScentsX customer, vendor and cash payer against it (design §8: "again when the list changes"). A failed
 * download is logged and changes nothing — the last list stays current and the desk shows its date.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { loadSanctionsList, rescreenAll } from "./sanctions.service.js";

let initialized = false;

export function initializeScentsxSanctionsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.SCENTSX_SANCTIONS_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("ScentsX OFAC list cron disabled via SCENTSX_SANCTIONS_CRON_ENABLED=false");
    return;
  }
  cron.schedule(
    "17 5 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "scentsx.sanctions_list_cron",
        async () => {
          const r = await withLuciaBypass(async (c) => {
            const load = await loadSanctionsList(c, SYSTEM_ACTOR_USER_ID);
            const rescreen = await rescreenAll(c, SYSTEM_ACTOR_USER_ID);
            return { load, rescreen };
          });
          app.log.info(r, "scentsx OFAC list: loaded / rescreened");
        },
        app.log
      );
    },
    { maxRandomDelay: 60000, timezone: "America/Chicago" }
  );
  app.log.info("ScentsX OFAC list cron scheduled (daily 05:17 America/Chicago)");
}
