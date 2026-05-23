import { describe, expect, it, vi } from "vitest";

const deliverMock = vi.fn(async () => ({ message: "ok" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000ba";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000bb";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM catalogs.accounts")) {
        if (String(values?.[0] ?? "") !== ACCOUNT_ID) return { rows: [] };
        if (String(values?.[1] ?? "") !== TENANT_A) return { rows: [] };
        return {
          rows: [
            {
              account_id: ACCOUNT_ID,
              account_number: "4100",
              account_name: "Linehaul Revenue",
              account_type: "Income",
              account_subtype: "SalesOfProductIncome",
              qbo_account_id: "QBO-ACC-1",
              deactivated_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.qbo_accounts") && sql.includes("qbo_id = $2")) {
        if (String(values?.[0] ?? "") !== TENANT_A) return { rows: [] };
        return { rows: [{ mirror_row_id: MIRROR_ID, qbo_id: "QBO-ACC-1", qbo_sync_token: "7" }] };
      }
      if (sql.includes("UPDATE mdata.qbo_accounts") && sql.includes("RETURNING id::text")) {
        return { rows: [{ id: MIRROR_ID }] };
      }
      if (sql.includes("SELECT qbo_id") && sql.includes("FROM mdata.qbo_accounts")) return { rows: [{ qbo_id: "QBO-ACC-1" }] };
      if (sql.includes("UPDATE catalogs.accounts") && sql.includes("qbo_account_id")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS account push tenant isolation", () => {
  it("refuses cross-tenant payload when source account is not tenant-visible", async () => {
    const { TmsAccountPushHandler } = await import("../tms-account-push.handler.js");
    const handler = new TmsAccountPushHandler();
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
          account_id: ACCOUNT_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("tms_account_missing");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes account", async () => {
    const { TmsAccountPushHandler } = await import("../tms-account-push.handler.js");
    const handler = new TmsAccountPushHandler();
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
          account_id: ACCOUNT_ID,
          operation: "update",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "ok" });

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
        entity: "account",
      }),
      expect.any(Object),
    );
  });
});
