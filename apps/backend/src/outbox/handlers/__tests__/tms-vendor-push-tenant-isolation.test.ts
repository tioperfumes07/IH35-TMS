import { describe, expect, it, vi } from "vitest";

const deliverMock = vi.fn(async () => ({ message: "ok" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const VENDOR_ID = "00000000-0000-4000-8000-0000000000aa";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000bb";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.vendors v")) {
        if (String(values?.[1] ?? "") !== TENANT_A) return { rows: [] };
        return {
          rows: [
            {
              vendor_id: VENDOR_ID,
              operating_company_id: TENANT_A,
              vendor_name: "Tenant A Vendor",
              vendor_type: "Other",
              vendor_code: "V-A",
              phone: "555-111-2222",
              email: "vendor-a@example.com",
              notes: null,
              deactivated_at: null,
              qbo_vendor_id: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.qbo_vendors") && sql.includes("qbo_id = $2")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_vendors") && sql.includes("primary_email")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_vendors") && sql.includes("lower(trim(display_name))")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_vendors")) return { rows: [{ id: MIRROR_ID }] };
      if (sql.includes("SELECT qbo_id") && sql.includes("FROM mdata.qbo_vendors")) return { rows: [{ qbo_id: "QBO-V-123" }] };
      if (sql.includes("UPDATE mdata.vendors") && sql.includes("qbo_vendor_id")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS vendor push tenant isolation", () => {
  it("refuses cross-tenant payload when vendor row is not in payload tenant", async () => {
    const { TmsVendorPushHandler } = await import("../tms-vendor-push.handler.js");
    const handler = new TmsVendorPushHandler();
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
          vendor_id: VENDOR_ID,
          operation: "update",
        },
        ctx
      )
    ).rejects.toThrow("tms_vendor_missing");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes vendor", async () => {
    const { TmsVendorPushHandler } = await import("../tms-vendor-push.handler.js");
    const handler = new TmsVendorPushHandler();
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
          vendor_id: VENDOR_ID,
          operation: "create",
        },
        ctx
      )
    ).resolves.toEqual({ message: "ok" });

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
        entity: "vendor",
      }),
      expect.any(Object)
    );
  });
});
