import { processSyncQueueBatch } from "./qbo-sync.service.js";

/** Outbound QBO writer tick (uses integrations.qbo_sync_queue). */
export async function processOutboundSyncWorkerTick(limit = 25) {
  return processSyncQueueBatch(limit);
}
