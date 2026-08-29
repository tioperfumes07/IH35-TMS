import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const distributeLoadInstructions = vi.fn();
const enqueueOutboxEvent = vi.fn();

vi.mock("../../../dispatch/load-distribution.service.js", () => ({
  distributeLoadInstructions: (...args: unknown[]) => distributeLoadInstructions(...args),
}));
vi.mock("../../enqueue-outbox-event.js", () => ({
  enqueueOutboxEvent: (...args: unknown[]) => enqueueOutboxEvent(...args),
}));

const payload = {
  load_id: "00000000-0000-4000-8000-0000000000d1",
  operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
  actor_user_id: "00000000-0000-4000-8000-0000000000c1",
};

describe("dispatch load instruction retry state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("acknowledges a later successful retry without raising a false failure alarm", async () => {
    distributeLoadInstructions.mockRejectedValueOnce(new Error("provider transient")).mockResolvedValueOnce(undefined);
    const query = vi.fn();
    const { DispatchLoadDispatchedHandler } = await import("../dispatch-load-dispatched.handler.js");
    const delivery = new DispatchLoadDispatchedHandler().deliver(payload, {
      client: { query } as never,
      eventId: "event-1",
      instanceId: "test",
      log: vi.fn(),
    });
    await vi.runAllTimersAsync();
    await expect(delivery).resolves.toEqual({ message: "driver_instructions_distributed" });
    expect(distributeLoadInstructions).toHaveBeenCalledTimes(2);
    expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
