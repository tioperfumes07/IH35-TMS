import { describe, it, expect, vi } from "vitest";

const mockBatch = vi.fn().mockResolvedValue({
  processed: 2,
  synced: 1,
  failed: 0,
  dead_lettered: 0,
  blocked: 0,
});

vi.mock("./qbo-sync.service.js", () => ({
  processSyncQueueBatch: (...args: unknown[]) => mockBatch(...args),
}));

describe("sync-outbound.worker", () => {
  it("delegates processOutboundSyncWorkerTick to processSyncQueueBatch", async () => {
    const { processOutboundSyncWorkerTick } = await import("./sync-outbound.worker.js");
    const r = await processOutboundSyncWorkerTick(7);
    expect(mockBatch).toHaveBeenCalledWith(7);
    expect(r.synced).toBe(1);
  });
});
