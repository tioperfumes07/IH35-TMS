import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

/**
 * GAP-IDEMP-KEYS daily cleanup: delete idempotency keys past their TTL.
 * Runs at 03:30 America/Chicago. Gated by ENABLE_IDEMPOTENCY_CLEANUP_CRON=false.
 */

let initialized = false;

export async function purgeExpiredIdempotencyKeys(): Promise<number> {
  return withLuciaBypass(async (client) => {
    const reg = await client.query<{ ok: boolean }>(
      `SELECT to_regclass('public.idempotency_keys') IS NOT NULL AS ok`
    );
    if (!reg.rows[0]?.ok) return 0;
    const res = await client.query(`DELETE FROM public.idempotency_keys WHERE ttl_at <= now()`);
    return res.rowCount ?? 0;
  });
}

export function initializeIdempotencyCleanupCron(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_IDEMPOTENCY_CLEANUP_CRON === "false") {
    app.log.info("Idempotency cleanup cron disabled via ENABLE_IDEMPOTENCY_CLEANUP_CRON=false");
    return;
  }

  cron.schedule(
    "30 3 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "idempotency.cleanup_cron",
        async () => {
          const deleted = await purgeExpiredIdempotencyKeys();
          if (deleted > 0) {
            app.log.info({ deleted }, "idempotency cleanup: expired keys purged");
          }
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Idempotency cleanup cron scheduled (daily 03:30 America/Chicago)");
}
