import { describe, expect, it, vi } from "vitest";

const deliverMock = vi.fn(async () => ({ message: "ok" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000aa";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000bb";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.customers")) {
        if (String(values?.[1] ?? "") !== TENANT_A) return { rows: [] };
        return {
          rows: [
            {
              customer_id: CUSTOMER_ID,
              operating_company_id: TENANT_A,
              customer_name: "Tenant A Customer",
              billing_email: "tenant-a@example.com",
              billing_phone: "555-111-2222",
              mc_number: "MC12345",
              status: "active",
              deactivated_at: null,
              qbo_customer_id: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.qbo_customers") && sql.includes("qbo_id = $2")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_customers") && sql.includes("mc_number = $2")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_customers") && sql.includes("lower(trim(display_name))")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_customers")) return { rows: [{ id: MIRROR_ID }] };
      if (sql.includes("SELECT qbo_id") && sql.includes("FROM mdata.qbo_customers")) return { rows: [{ qbo_id: "QBO-123" }] };
      if (sql.includes("UPDATE mdata.customers") && sql.includes("qbo_customer_id")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS customer push tenant isolation", () => {
  it("refuses cross-tenant payload when customer row is not in payload tenant", async () => {
    const { TmsCustomerPushHandler } = await import("../tms-customer-push.handler.js");
    const handler = new TmsCustomerPushHandler();
    const ctx = {
      client: makeClient() as never,
      eventId: "evt-1",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_B,
          customer_id: CUSTOMER_ID,
          operation: "update",
        },
        ctx
      )
    ).rejects.toThrow("tms_customer_missing");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes customer", async () => {
    const { TmsCustomerPushHandler } = await import("../tms-customer-push.handler.js");
    const handler = new TmsCustomerPushHandler();
    const ctx = {
      client: makeClient() as never,
      eventId: "evt-2",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_A,
          customer_id: CUSTOMER_ID,
          operation: "create",
        },
        ctx
      )
    ).resolves.toEqual({ message: "ok" });

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
        entity: "customer",
      }),
      expect.any(Object)
    );
  });
});
