import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { processInboundSyncBatch } from "../integrations/qbo/sync-inbound.worker.js";

let timer: ReturnType<typeof setInterval> | undefined;

export function initializeQboInboundSyncCron(app: FastifyInstance) {
  if (process.env.ENABLE_QBO_INBOUND_SYNC !== "true") {
    app.log.info("[qbo_inbound_sync] disabled unless ENABLE_QBO_INBOUND_SYNC=true");
    return;
  }

  markRunnerInitialized("qbo_inbound_sync");
  if (timer) clearInterval(timer);

  const tick = async () => {
    await wrapBackgroundJobTick(
      "integrations.qbo_inbound_sync",
      async () => {
        markRunnerTick("qbo_inbound_sync");
        await processInboundSyncBatch(25);
      },
      app.log,
      { onError: (error) => markRunnerFailed("qbo_inbound_sync", error) }
    );
  };

  timer = setInterval(() => {
    void tick();
  }, 15_000);
}

export function stopQboInboundSyncCron() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
