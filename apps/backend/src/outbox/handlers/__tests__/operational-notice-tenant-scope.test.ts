import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotification = vi.fn(async () => ({ id: "notice-1" }));
const dispatchNotification = vi.fn(async () => ({ ok: true, channels: {} }));

vi.mock("../../../notifications/notification.service.js", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));
vi.mock("../../../notifications/dispatcher.js", () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...args),
}));

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER = "00000000-0000-4000-8000-0000000000c1";
const LOAD = "00000000-0000-4000-8000-0000000000d1";

describe("operational notices tenant-scope role recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchNotification.mockResolvedValue({ ok: true, channels: {} });
  });

  it("binds the event company to active access/default-company resolution", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT DISTINCT u.id::text AS id")) {
        expect(sql).toContain("LEFT JOIN org.user_company_access uca");
        expect(sql).toContain("uca.company_id = $1::uuid");
        expect(sql).toContain("uca.deactivated_at IS NULL");
        expect(sql).toContain("u.default_company_id = $1::uuid");
        expect(params?.[0]).toBe(COMPANY);
        expect(params?.[1]).toEqual(
          expect.arrayContaining(["Owner", "Administrator"]),
        );
        return { rows: [{ id: USER }] };
      }
      return { rows: [] };
    });
    const { createOperationalNoticeHandler } = await import("../operational-notice.handler.js");
    const { NOTICE_ROUTES } = await import("../operational-notice.routes.js");
    const route = NOTICE_ROUTES.find((candidate) => candidate.eventType === "load.abandoned");
    expect(route).toBeDefined();
    const handler = createOperationalNoticeHandler(route!);

    await handler.deliver(
      { operating_company_id: COMPANY, load_id: LOAD, load_number: "TEST-LOAD" },
      { client: { query } as never, eventId: "event-1", instanceId: "test", log: vi.fn() },
    );

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ operating_company_id: COMPANY, user_id: USER, entity_id: LOAD }),
      expect.anything(),
    );
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        event_type: "abandoned_load",
        payload: expect.objectContaining({ operating_company_id: COMPANY, load_id: LOAD }),
      }),
    );
  });

  it("throws when durable abandonment channel delivery resolves ok:false", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("SELECT DISTINCT u.id::text AS id") ? { rows: [{ id: USER }] } : { rows: [] },
    );
    dispatchNotification.mockResolvedValueOnce({ ok: false, error: "email_enqueue_failed" });
    const { createOperationalNoticeHandler } = await import("../operational-notice.handler.js");
    const { NOTICE_ROUTES } = await import("../operational-notice.routes.js");
    const route = NOTICE_ROUTES.find((candidate) => candidate.eventType === "load.abandoned");
    const handler = createOperationalNoticeHandler(route!);

    await expect(
      handler.deliver(
        { operating_company_id: COMPANY, load_id: LOAD, load_number: "TEST-LOAD" },
        { client: { query } as never, eventId: "event-2", instanceId: "test", log: vi.fn() },
      ),
    ).rejects.toThrow("load.abandoned_multichannel_delivery_failed:1/1");
  });
});
