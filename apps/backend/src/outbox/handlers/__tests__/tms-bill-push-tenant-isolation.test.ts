import { describe, expect, it, vi } from "vitest";

const deliverBillMock = vi.fn(async () => ({ Id: "QBO-BILL-1", SyncToken: "3" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboBillPush: deliverBillMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const BILL_ID = "00000000-0000-4000-8000-0000000000c1";
const VENDOR_ID = "00000000-0000-4000-8000-0000000000c2";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000c3";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM accounting.bills b")) {
        if (String(values?.[0] ?? "") !== BILL_ID) return { rows: [] };
        if (String(values?.[1] ?? "") !== TENANT_A) return { rows: [] };
        return {
          rows: [
            {
              bill_id: BILL_ID,
              bill_number: "BILL-1001",
              bill_date: "2026-05-20",
              due_date: "2026-05-30",
              amount_cents: 12500,
              memo: "Scoped bill",
              vendor_key: VENDOR_ID,
              qbo_vendor_id: "QBO-VENDOR-1",
              coa_account_id: ACCOUNT_ID,
              qbo_bill_id: null,
              qbo_sync_token: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.bill_lines")) return { rows: [] };
      if (sql.includes("FROM catalogs.accounts a")) {
        if (String(values?.[0] ?? "") !== TENANT_A) return { rows: [] };
        return { rows: [{ qbo_account_id: "QBO-EXP-1" }] };
      }
      if (sql.includes("FROM qbo_archive.entities_snapshot")) {
        if (String(values?.[0] ?? "") !== TENANT_A) return { rows: [] };
        return { rows: [{ qbo_entity_id: "QBO-AP-1" }] };
      }
      return { rows: [] };
    }),
  };
}

describe("TMS bill push tenant isolation", () => {
  it("refuses cross-tenant payload when source bill is not tenant-visible", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient() as never,
      eventId: "evt-tenant-a",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_B,
          bill_id: BILL_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("tms_bill_missing");
    expect(deliverBillMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes bill", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient() as never,
      eventId: "evt-tenant-b",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_A,
          bill_id: BILL_ID,
          operation: "create",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "tms_bill_push_create_QBO-BILL-1" });
    expect(deliverBillMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
        bill_id: BILL_ID,
      }),
    );
  });
});
