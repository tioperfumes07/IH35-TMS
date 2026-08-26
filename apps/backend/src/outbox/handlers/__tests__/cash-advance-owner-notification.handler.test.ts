import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchNotification = vi.fn();
const listCompanyUserIdsByRoles = vi.fn();

vi.mock("../../../notifications/dispatcher.js", () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...args),
  listCompanyUserIdsByRoles: (...args: unknown[]) => listCompanyUserIdsByRoles(...args),
}));

const COMPANY = "00000000-0000-4000-8000-0000000000a1";
const REQUEST_ID = "00000000-0000-4000-8000-0000000000b1";
const OWNER_1 = "00000000-0000-4000-8000-0000000000c1";
const OWNER_2 = "00000000-0000-4000-8000-0000000000c2";

function ctx() {
  return { client: {} as never, eventId: "evt-1", instanceId: "t1", log: () => {} };
}

describe("CashAdvanceOwnerNotificationHandler — CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers to every owner and returns success when all dispatches succeed", async () => {
    listCompanyUserIdsByRoles.mockResolvedValue([OWNER_1, OWNER_2]);
    dispatchNotification.mockResolvedValue({ ok: true, channels: {} });
    const { CashAdvanceOwnerNotificationHandler } = await import("../cash-advance-owner-notification.handler.js");
    const handler = new CashAdvanceOwnerNotificationHandler();

    const result = await handler.deliver(
      { operating_company_id: COMPANY, request_id: REQUEST_ID, display_id: "CA-0001", requested_amount_cents: 50000, actor_user_id: "driver-1" },
      ctx()
    );

    expect(result?.message).toBe("cash_advance_owner_notification_dispatched");
    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: OWNER_1, event_type: "advance.created", actor_user_id: "driver-1" })
    );
  });

  // The exact bug this handler replaces: dispatchNotification resolving { ok: false } used to be
  // silently discarded. A real failure must now THROW so the outbox processor retries instead of
  // reporting success for an alert nobody received.
  it("throws when any owner dispatch resolves ok:false (does not silently swallow the failure)", async () => {
    listCompanyUserIdsByRoles.mockResolvedValue([OWNER_1, OWNER_2]);
    dispatchNotification.mockResolvedValueOnce({ ok: true, channels: {} }).mockResolvedValueOnce({ ok: false, error: "channel_disabled" });
    const { CashAdvanceOwnerNotificationHandler } = await import("../cash-advance-owner-notification.handler.js");
    const handler = new CashAdvanceOwnerNotificationHandler();

    await expect(
      handler.deliver({ operating_company_id: COMPANY, request_id: REQUEST_ID, display_id: "CA-0001", requested_amount_cents: 50000 }, ctx())
    ).rejects.toThrow(/cash_advance_owner_notification_delivery_failed:1\/2/);
  });

  it("fails loud (throws) on a zero-recipient company instead of a silent no-op success", async () => {
    listCompanyUserIdsByRoles.mockResolvedValue([]);
    const { CashAdvanceOwnerNotificationHandler } = await import("../cash-advance-owner-notification.handler.js");
    const handler = new CashAdvanceOwnerNotificationHandler();

    await expect(
      handler.deliver({ operating_company_id: COMPANY, request_id: REQUEST_ID, display_id: "CA-0001" }, ctx())
    ).rejects.toThrow(/cash_advance_owner_notification_zero_recipients/);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("declares requiresDelivery so an unavailable handler is never reported as delivered", async () => {
    const { CashAdvanceOwnerNotificationHandler } = await import("../cash-advance-owner-notification.handler.js");
    const handler = new CashAdvanceOwnerNotificationHandler();
    expect(handler.requiresDelivery).toBe(true);
    expect(handler.eventType).toBe("driver_finance.cash_advance_request.submitted");
  });
});
