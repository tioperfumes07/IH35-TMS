import { processSyncQueueBatch } from "./qbo-sync.service.js";

/** Poll + claim rows from integrations.qbo_sync_queue (see qbo-sync.service processSyncQueueBatch). */
export async function processOutboundSyncWorkerTick(limit = 25) {
  return processSyncQueueBatch(limit);
}
