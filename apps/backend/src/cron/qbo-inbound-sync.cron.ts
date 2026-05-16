import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { processInboundSyncBatch } from "../integrations/qbo/sync-inbound.worker.js";

let timer: ReturnType<typeof setInterval> | undefined;

export function initializeQboInboundSyncCron(app: FastifyInstance) {
  markRunnerInitialized("qbo_inbound_sync");
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    await wrapBackgroundJobTick(
      "integrations.qbo_inbound_sync",
      async () => {
        markRunnerTick("qbo_inbound_sync");
        await processInboundSyncBatch(25);
      },
      app.log,
      { onError: (error) => markRunnerFailed("qbo_inbound_sync", error) }
    );
  }, 15_000);
}

export function stopQboInboundSyncCron() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
