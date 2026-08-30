import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeDriverSms = vi.fn(async () => ({ success: true, sid: "sms-1" }));
const sendEmail = vi.fn(async () => ({ id: "email-1" }));

vi.mock("../../../notifications/sms-bridge.service.js", () => ({
  bridgeDriverSms: (...args: unknown[]) => bridgeDriverSms(...args),
}));
vi.mock("../../../notifications/email.service.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const MESSAGE = "00000000-0000-4000-8000-0000000000a1";
const DRIVER = "00000000-0000-4000-8000-0000000000b1";

describe("driver profile message delivery worker RLS context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("establishes lucia bypass before the exact company-scoped delivery receipt update", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("UPDATE mdata.driver_profile_messages")) return { rows: [{ id: MESSAGE }] };
      return { rows: [] };
    });
    const { DriverProfileMessageDeliveryHandler } = await import("../driver-profile-message-delivery.handler.js");

    await new DriverProfileMessageDeliveryHandler().deliver(
      {
        operating_company_id: COMPANY,
        aggregate_id: MESSAGE,
        driver_id: DRIVER,
        channel: "sms",
        to: "+15555550123",
        message: "TEST dispatch message",
      },
      { client: { query } as never, eventId: "event-1", instanceId: "test", log: vi.fn() },
    );

    const bypassIndex = calls.findIndex(({ sql }) => sql.includes("app.bypass_rls"));
    const updateIndex = calls.findIndex(({ sql }) => sql.includes("UPDATE mdata.driver_profile_messages"));
    expect(bypassIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(bypassIndex);
    expect(calls[updateIndex]?.sql).toContain("operating_company_id = $2::uuid");
    expect(calls[updateIndex]?.sql).toContain("driver_id = $4::uuid");
    expect(calls[updateIndex]?.params).toEqual([MESSAGE, COMPANY, "sms-1", DRIVER]);
  });

  it("fails loud when the exact delivery receipt row is absent", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { DriverProfileMessageDeliveryHandler } = await import("../driver-profile-message-delivery.handler.js");

    await expect(new DriverProfileMessageDeliveryHandler().deliver(
      {
        operating_company_id: COMPANY,
        aggregate_id: MESSAGE,
        driver_id: DRIVER,
        channel: "email",
        to: "driver@example.test",
        message: "TEST dispatch message",
      },
      { client: { query } as never, eventId: "event-2", instanceId: "test", log: vi.fn() },
    )).rejects.toThrow("driver_profile_message_delivery_row_not_found");
  });
});
