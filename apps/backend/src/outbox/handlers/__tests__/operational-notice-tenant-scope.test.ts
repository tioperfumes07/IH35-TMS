import { describe, expect, it, vi } from "vitest";

const createNotification = vi.fn(async () => ({ id: "notice-1" }));

vi.mock("../../../notifications/notification.service.js", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER = "00000000-0000-4000-8000-0000000000c1";
const LOAD = "00000000-0000-4000-8000-0000000000d1";

describe("operational notices tenant-scope role recipients", () => {
  it("binds the event company to active access/default-company resolution", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT DISTINCT u.id::text AS id")) {
        expect(sql).toContain("LEFT JOIN org.user_company_access uca");
        expect(sql).toContain("uca.company_id = $1::uuid");
        expect(sql).toContain("uca.deactivated_at IS NULL");
        expect(sql).toContain("u.default_company_id = $1::uuid");
        expect(params).toEqual([COMPANY, ["Owner", "Administrator", "Dispatcher"]]);
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
  });
});
