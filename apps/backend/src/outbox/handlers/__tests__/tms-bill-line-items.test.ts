import { describe, expect, it, vi } from "vitest";

const deliverBillMock = vi.fn(async () => ({ Id: "QBO-BILL-77", SyncToken: "9" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboBillPush: deliverBillMock,
}));

const TENANT = "00000000-0000-4000-8000-000000000101";
const BILL_ID = "00000000-0000-4000-8000-000000000102";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000103";

type ClientOptions = {
  vendorQboId?: string | null;
  headerAccountQboId?: string | null;
  lineRows?: Array<{ id: string; seq: number; amount: string; description: string | null; accountId?: string | null }>;
};

function makeClient(options?: ClientOptions) {
  const vendorQboId = options && "vendorQboId" in options ? options.vendorQboId : "QBO-VENDOR-1";
  const headerAccountQboId = options && "headerAccountQboId" in options ? options.headerAccountQboId : "QBO-EXP-1";
  const lineRows = options?.lineRows ?? [];

  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM accounting.bills b")) {
        return {
          rows: [
            {
              bill_id: BILL_ID,
              bill_number: "BILL-77",
              bill_date: "2026-05-21",
              due_date: "2026-05-31",
              amount_cents: 25000,
              memo: "Test memo",
              vendor_key: "00000000-0000-4000-8000-000000000104",
              qbo_vendor_id: vendorQboId,
              coa_account_id: ACCOUNT_ID,
              qbo_bill_id: null,
              qbo_sync_token: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.bill_lines")) {
        return {
          rows: lineRows.map((row) => ({
            line_id: row.id,
            line_sequence: row.seq,
            amount: row.amount,
            description: row.description,
            account_id: row.accountId ?? ACCOUNT_ID,
          })),
        };
      }
      if (sql.includes("FROM catalogs.accounts a")) {
        return {
          rows: [{ qbo_account_id: headerAccountQboId }],
        };
      }
      if (sql.includes("FROM qbo_archive.entities_snapshot")) {
        return { rows: [{ qbo_entity_id: "QBO-AP-1" }] };
      }
      return { rows: [] };
    }),
  };
}

describe("TMS bill line item shape", () => {
  it("builds single-line payload from bill header when no child lines exist", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient() as never,
      eventId: "evt-single",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT,
          bill_id: BILL_ID,
          operation: "create",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "tms_bill_push_create_QBO-BILL-77" });

    expect(deliverBillMock).toHaveBeenCalled();
    const payload = deliverBillMock.mock.calls.at(-1)?.[0] as { qbo_body: Record<string, unknown> };
    const qboBody = payload.qbo_body;
    expect(qboBody.VendorRef).toEqual({ value: "QBO-VENDOR-1" });
    expect(qboBody.DocNumber).toBe("BILL-77");
    expect(qboBody.DueDate).toBe("2026-05-31");
    const lines = qboBody.Line as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(1);
    expect(lines[0].Amount).toBe(250);
  });

  it("builds multi-line payload with AccountBasedExpenseLineDetail lines", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient({
        lineRows: [
          { id: "line-1", seq: 1, amount: "125.50", description: "Fuel" },
          { id: "line-2", seq: 2, amount: "74.25", description: "Lumper" },
        ],
      }) as never,
      eventId: "evt-multi",
      instanceId: "test",
      log: () => {},
    };

    await handler.deliver(
      {
        operating_company_id: TENANT,
        bill_id: BILL_ID,
        operation: "update",
      },
      ctx,
    );

    const payload = deliverBillMock.mock.calls.at(-1)?.[0] as { qbo_body: Record<string, unknown> };
    const lines = payload.qbo_body.Line as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    expect(lines[0].DetailType).toBe("AccountBasedExpenseLineDetail");
    expect(lines[0].AccountBasedExpenseLineDetail).toEqual({
      AccountRef: { value: "QBO-EXP-1" },
    });
    expect(payload.qbo_body.TotalAmt).toBe(199.75);
  });

  it("fails fast when vendor qbo id is missing", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient({ vendorQboId: null }) as never,
      eventId: "evt-missing-vendor",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT,
          bill_id: BILL_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("bill_vendor_qbo_id_missing");
  });

  it("fails fast when line account qbo id is missing", async () => {
    const { TmsBillPushHandler } = await import("../tms-bill-push.handler.js");
    const handler = new TmsBillPushHandler();
    const ctx = {
      client: makeClient({ headerAccountQboId: null }) as never,
      eventId: "evt-missing-account",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT,
          bill_id: BILL_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("bill_line_account_qbo_id_missing");
  });
});
