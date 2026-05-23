import { describe, expect, it, vi } from "vitest";

const deliverMock = vi.fn(async (payload: { operating_company_id: string }) => {
  // Synthetic tenant guard: mirror row belongs to tenant A only.
  if (payload.operating_company_id !== "00000000-0000-4000-8000-000000000001") {
    throw new Error("mirror_customer_missing");
  }
  return { message: "ok" };
});

vi.mock("../push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

describe("QBO customer sync tenant isolation", () => {
  it("refuses cross-tenant payload when mirror row is not in payload tenant", async () => {
    const { QboMasterEntityPushHandler } = await import("../../outbox/handlers/qbo-master-entity-push.handler.js");
    const handler = new QboMasterEntityPushHandler();
    const ctx = {
      client: { query: vi.fn() } as never,
      eventId: "evt-1",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: "00000000-0000-4000-8000-000000000002",
          mirror_row_id: "00000000-0000-4000-8000-0000000000aa",
          entity: "customer",
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("mirror_customer_missing");

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror_row_id: "00000000-0000-4000-8000-0000000000aa",
        entity: "customer",
        operation: "update",
      }),
      expect.any(Object),
    );
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: "00000000-0000-4000-8000-000000000002",
      }),
      expect.any(Object),
    );
  });

  it("allows matching-tenant payload", async () => {
    const { QboMasterEntityPushHandler } = await import("../../outbox/handlers/qbo-master-entity-push.handler.js");
    const handler = new QboMasterEntityPushHandler();
    const ctx = {
      client: { query: vi.fn() } as never,
      eventId: "evt-2",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: "00000000-0000-4000-8000-000000000001",
          mirror_row_id: "00000000-0000-4000-8000-0000000000aa",
          entity: "customer",
          operation: "update",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "ok" });
  });
});
