import { describe, expect, it, vi } from "vitest";

const deliverMock = vi.fn(async () => ({ message: "ok" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const ITEM_ID = "00000000-0000-4000-8000-0000000000ab";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000ac";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000ad";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM catalogs.items")) {
        if (String(values?.[0] ?? "") !== ITEM_ID) return { rows: [] };
        return {
          rows: [
            {
              item_id: ITEM_ID,
              item_name: "Tenant Item",
              item_code: "SKU-001",
              item_type: "Service",
              description: "Scoped item",
              unit_price_cents: 4200,
              default_income_account_id: ACCOUNT_ID,
              qbo_item_id: null,
              deactivated_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM catalogs.accounts")) {
        if (String(values?.[0] ?? "") !== TENANT_A) return { rows: [] };
        return { rows: [{ qbo_account_id: "INC-ACCOUNT-A" }] };
      }
      if (sql.includes("FROM mdata.qbo_items") && sql.includes("qbo_id = $2")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_items") && sql.includes("lower(trim(name))")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_items")) return { rows: [{ id: MIRROR_ID }] };
      if (sql.includes("SELECT qbo_id") && sql.includes("FROM mdata.qbo_items")) return { rows: [{ qbo_id: "QBO-ITEM-1" }] };
      if (sql.includes("UPDATE catalogs.items") && sql.includes("qbo_item_id")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS item push tenant isolation", () => {
  it("refuses cross-tenant payload when tenant income account cannot be resolved", async () => {
    const { TmsItemPushHandler } = await import("../tms-item-push.handler.js");
    const handler = new TmsItemPushHandler();
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
          item_id: ITEM_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("tms_item_income_account_qbo_id_missing");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes item", async () => {
    const { TmsItemPushHandler } = await import("../tms-item-push.handler.js");
    const handler = new TmsItemPushHandler();
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
          item_id: ITEM_ID,
          operation: "create",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "ok" });

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
        entity: "item",
      }),
      expect.any(Object),
    );
  });
});
