import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotification = vi.fn(async () => ({ id: "notice-1" }));

vi.mock("../../../notifications/notification.service.js", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER = "00000000-0000-4000-8000-0000000000c1";
const LOAD = "00000000-0000-4000-8000-0000000000d1";

describe("dispatch distribution-failure alert durability", () => {
  beforeEach(() => vi.clearAllMocks());

  function context() {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT load_number")) return { rows: [{ load_number: "TEST-LOAD" }] };
      if (sql.includes("SELECT DISTINCT u.id::text AS id")) {
        expect(sql).toContain("LEFT JOIN org.user_company_access uca");
        expect(sql).toContain("uca.company_id = $1::uuid");
        expect(sql).toContain("u.default_company_id = $1::uuid OR uca.user_id IS NOT NULL");
        expect(params).toEqual([COMPANY]);
        return { rows: [{ id: USER }] };
      }
      return { rows: [] };
    });
    return { client: { query } as never, eventId: "event-1", instanceId: "test", log: vi.fn() };
  }

  it("scopes recipients to the immutable event company", async () => {
    const { DispatchDistributionFailureHandler } = await import("../dispatch-distribution-failure.handler.js");
    await new DispatchDistributionFailureHandler().deliver(
      { operating_company_id: COMPANY, load_id: LOAD, attempts: 3, reason: "provider failed" },
      context(),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ operating_company_id: COMPANY, user_id: USER, entity_id: LOAD }),
      expect.anything(),
    );
  });

  it("fails loud when notification persistence returns no identity", async () => {
    createNotification.mockResolvedValueOnce(null as never);
    const { DispatchDistributionFailureHandler } = await import("../dispatch-distribution-failure.handler.js");
    await expect(
      new DispatchDistributionFailureHandler().deliver(
        { operating_company_id: COMPANY, load_id: LOAD, attempts: 3, reason: "provider failed" },
        context(),
      ),
    ).rejects.toThrow(`distribution_failure_notification_insert_returned_no_identity:${USER}`);
  });
});
