import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const enqueueEmail = vi.fn(async () => ({ queueId: "queue-1" }));
  const sendSms = vi.fn(async () => ({ success: true }));
  const sendWhatsAppMessage = vi.fn(async () => ({ success: true, message_id: "mid-1" }));
  const queryMock = vi.fn();
  return { enqueueEmail, sendSms, sendWhatsAppMessage, queryMock };
});

vi.mock("../email/queue.service.js", () => ({
  enqueueEmail: mocks.enqueueEmail,
}));

vi.mock("../sms/sender.js", () => ({
  sendSms: mocks.sendSms,
}));

vi.mock("../whatsapp/sender.js", () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}));

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: { query: typeof mocks.queryMock }) => Promise<unknown>) => {
    return fn({ query: mocks.queryMock });
  }),
}));

import { dispatchNotification } from "./dispatcher.js";

describe("dispatchNotification", () => {
  beforeEach(() => {
    mocks.enqueueEmail.mockClear();
    mocks.sendSms.mockClear();
    mocks.sendWhatsAppMessage.mockClear();
    mocks.queryMock.mockReset();

    mocks.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('identity.user_notification_preferences')")) {
        return { rows: [{ r: null }] };
      }
      if (sql.includes("FROM identity.users")) {
        return { rows: [{ email: "driver@example.com" }] };
      }
      if (sql.includes("audit.append_event")) {
        return { rows: [] };
      }
      if (sql.includes("set_config('app.operating_company_id'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  it("enqueues settlement-ready email using dispatcher defaults", async () => {
    const result = await dispatchNotification({
      user_id: "11111111-1111-1111-1111-111111111111",
      event_type: "settlement.created",
      actor_user_id: "22222222-2222-2222-2222-222222222222",
      payload: {
        operating_company_id: "33333333-3333-3333-3333-333333333333",
        driverName: "Test Driver",
        settlementLabel: "ST-1",
        amountLabel: "USD 12.34",
        settlement_no: "ST-1",
        net: "12.34",
        link: "https://example.test/driver",
      },
    });

    expect(result.ok).toBe(true);
    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueEmail.mock.calls[0]?.[0]).toMatchObject({
      templateKey: "settlement-ready",
      subject: expect.stringContaining("Settlement ready"),
    });
    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();

    const appendCalls = mocks.queryMock.mock.calls.filter(([sql]) => sql.includes("audit.append_event"));
    expect(appendCalls.length).toBe(1);
    const params = appendCalls[0]![1] as unknown[];
    expect(params[0]).toBe("notification.sent");
  });

  it("skips email when preferences disable email for the event", async () => {
    mocks.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('identity.user_notification_preferences')")) {
        return { rows: [{ r: "identity.user_notification_preferences" }] };
      }
      if (sql.includes("FROM identity.user_notification_preferences")) {
        return {
          rows: [
            {
              channels: { email: false, sms: false, whatsapp: false, in_app: true },
              event_overrides: {},
              quiet_hours_start: null,
              quiet_hours_end: null,
              timezone: null,
              email_enabled: true,
              sms_enabled: false,
              whatsapp_enabled: false,
            },
          ],
        };
      }
      if (sql.includes("FROM identity.users")) {
        return { rows: [{ email: "driver@example.com" }] };
      }
      if (sql.includes("audit.append_event")) {
        return { rows: [] };
      }
      if (sql.includes("set_config('app.operating_company_id'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await dispatchNotification({
      user_id: "11111111-1111-1111-1111-111111111111",
      event_type: "settlement.created",
      actor_user_id: "22222222-2222-2222-2222-222222222222",
      payload: {
        operating_company_id: "33333333-3333-3333-3333-333333333333",
        settlement_no: "ST-1",
        net: "12.34",
      },
    });

    expect(result.ok).toBe(true);
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
  });
});
