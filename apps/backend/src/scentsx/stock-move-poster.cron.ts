/**
 * SCENTSX B3b — every 5 minutes, post the TIO Perfumes stock moves that have no ScentsX journal entry yet.
 * Flag SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED (per entity, ON for SCENTSX only) gates every post. A move that fails is
 * logged with its id and stays pending — the Books screen shows the pending count and offers "Post now".
 * Not a carrier engine: it runs for SCENTSX only, so it does not loop org.companies.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";

let initialized = false;

export function initializeScentsxStockMovePosterCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.SCENTSX_STOCK_MOVE_POSTER_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("ScentsX stock-move poster cron disabled via SCENTSX_STOCK_MOVE_POSTER_CRON_ENABLED=false");
    return;
  }
  cron.schedule(
    "*/5 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "scentsx.stock_move_poster_cron",
        async () => {
          const r = await withLuciaBypass((c) => postPendingStockMoves(c, { userId: SYSTEM_ACTOR_USER_ID, role: "Owner" }));
          if (r.failed.length) app.log.error({ failed: r.failed }, "scentsx stock-move poster: moves failed to post");
          else if (r.posted) app.log.info({ posted: r.posted }, "scentsx stock-move poster: posted");
        },
        app.log
      );
    },
    { maxRandomDelay: 20000, timezone: "America/Chicago" }
  );
  app.log.info("ScentsX stock-move poster cron scheduled (every 5 minutes, America/Chicago)");
}
