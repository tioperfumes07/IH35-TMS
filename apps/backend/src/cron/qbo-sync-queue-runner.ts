import cron from "node-cron";
import type { FastifyBaseLogger } from "fastify";
import { processSyncQueueBatch } from "../integrations/qbo/qbo-sync.service.js";

let runnerStarted = false;

export function initializeQboSyncQueueRunner(log: FastifyBaseLogger) {
  if (runnerStarted) return;
  runnerStarted = true;
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const result = await processSyncQueueBatch(50);
        log.info(
          {
            step: "queue_batch_processed",
            processed: result.processed,
            synced: result.synced,
            failed: result.failed,
            blocked: result.blocked,
          },
          "[QBO_SYNC_RUNNER]"
        );
      } catch (error) {
        log.error({ err: error }, "[QBO_SYNC_RUNNER] Fatal error");
      }
    },
    { timezone: "America/Chicago" }
  );
}

