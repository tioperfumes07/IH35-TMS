import { beforeEach, describe, expect, it, vi } from "vitest";

const deliverInvoiceMock = vi.fn(async () => ({ message: "ok", qbo_id: "QBO-INV-1", qbo_sync_token: "9" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboInvoicePush: deliverInvoiceMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const INVOICE_ID = "00000000-0000-4000-8000-0000000000e1";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000e2";

function makeClient(options?: {
  customerQboId?: string | null;
  customerBillingState?: string | null;
  lines?: Array<{
    line_id: string;
    line_type: string;
    description: string;
    quantity: string;
    unit_amount_cents: number;
    line_total_cents: number;
    qbo_item_id: string | null;
    qbo_class_snapshot: string | null;
  }>;
  fallbackItemQboId?: string | null;
}) {
  const customerQboId = options && "customerQboId" in options ? options.customerQboId : "QBO-CUST-1";
  const customerBillingState = options?.customerBillingState ?? "CA";
  const lines =
    options?.lines ??
    [
      {
        line_id: "line-1",
        line_type: "linehaul",
        description: "Freight",
        quantity: "2",
        unit_amount_cents: 50000,
        line_total_cents: 100000,
        qbo_item_id: "QBO-ITEM-1",
        qbo_class_snapshot: null,
      },
    ];

  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices i")) {
        return {
          rows: [
            {
              invoice_id: INVOICE_ID,
              operating_company_id: TENANT_A,
              customer_id: "00000000-0000-4000-8000-0000000000c1",
              display_id: "INV-2026-00007",
              issue_date: "2026-05-23",
              due_date: "2026-06-22",
              total_cents: 100000,
              internal_notes: "internal",
              customer_notes: "memo",
              ar_email_snapshot: "ar@customer.com",
              qbo_invoice_id: null,
              qbo_sync_token: null,
              customer_qbo_id: customerQboId,
              customer_billing_state: customerBillingState,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoice_lines l")) {
        return { rows: lines };
      }
      if (sql.includes("FROM mdata.qbo_items")) {
        return { rows: options?.fallbackItemQboId ? [{ qbo_id: options.fallbackItemQboId }] : [] };
      }
      if (sql.includes("FROM mdata.qbo_invoices") && sql.includes("invoice_id = $2::uuid")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_invoices")) return { rows: [{ id: MIRROR_ID }] };
      if (sql.includes("SELECT qbo_id, qbo_sync_token") && sql.includes("FROM mdata.qbo_invoices")) {
        return { rows: [{ qbo_id: "QBO-INV-1", qbo_sync_token: "9" }] };
      }
      if (sql.includes("UPDATE accounting.invoices") && sql.includes("qbo_invoice_id")) return { rows: [] };
      if (sql.includes("audit.append_event")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS invoice line-item payloads", () => {
  beforeEach(() => {
    deliverInvoiceMock.mockClear();
  });

  it("builds single-line payload with ItemRef, Qty, UnitPrice", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
    const ctx = { client: makeClient() as never, eventId: "evt-1", instanceId: "test", log: () => {} };

    await expect(
      handler.deliver({ operating_company_id: TENANT_A, invoice_id: INVOICE_ID, operation: "create" }, ctx),
    ).resolves.toEqual({ message: "ok" });

    const firstCall = deliverInvoiceMock.mock.calls[0]?.[0] as { qbo_body?: any } | undefined;
    const line = firstCall?.qbo_body?.Line?.[0];
    expect(line?.SalesItemLineDetail?.ItemRef?.value).toBe("QBO-ITEM-1");
    expect(line?.SalesItemLineDetail?.Qty).toBe(2);
    expect(line?.SalesItemLineDetail?.UnitPrice).toBe(500);
  });

  it("maps tax-vs-no-tax across multi-line payload", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
    const ctx = {
      client: makeClient({
        lines: [
          {
            line_id: "line-1",
            line_type: "linehaul",
            description: "Freight",
            quantity: "1",
            unit_amount_cents: 80000,
            line_total_cents: 80000,
            qbo_item_id: "QBO-ITEM-FRT",
            qbo_class_snapshot: null,
          },
          {
            line_id: "line-2",
            line_type: "accessorial",
            description: "Detention",
            quantity: "1",
            unit_amount_cents: 20000,
            line_total_cents: 20000,
            qbo_item_id: "QBO-ITEM-DET",
            qbo_class_snapshot: null,
          },
        ],
      }) as never,
      eventId: "evt-2",
      instanceId: "test",
      log: () => {},
    };

    await handler.deliver({ operating_company_id: TENANT_A, invoice_id: INVOICE_ID, operation: "create" }, ctx);
    const body = (deliverInvoiceMock.mock.calls[0]?.[0] as { qbo_body: any }).qbo_body;
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("NON");
    expect(body.Line[1].SalesItemLineDetail.TaxCodeRef.value).toBe("TAX_CA");
  });

  it("fails fast when customer qbo id is missing", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
    const ctx = {
      client: makeClient({ customerQboId: null }) as never,
      eventId: "evt-3",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver({ operating_company_id: TENANT_A, invoice_id: INVOICE_ID, operation: "update" }, ctx),
    ).rejects.toThrow("invoice_customer_missing_qbo_id");
    expect(deliverInvoiceMock).not.toHaveBeenCalled();
  });

  it("fails fast when a line item qbo id cannot be resolved", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
    const ctx = {
      client: makeClient({
        lines: [
          {
            line_id: "line-404",
            line_type: "accessorial",
            description: "Unmapped line",
            quantity: "1",
            unit_amount_cents: 5000,
            line_total_cents: 5000,
            qbo_item_id: null,
            qbo_class_snapshot: null,
          },
        ],
        fallbackItemQboId: null,
      }) as never,
      eventId: "evt-4",
      instanceId: "test",
      log: () => {},
    };

    await expect(
      handler.deliver({ operating_company_id: TENANT_A, invoice_id: INVOICE_ID, operation: "update" }, ctx),
    ).rejects.toThrow("invoice_line_missing_qbo_item_id:line-404");
    expect(deliverInvoiceMock).not.toHaveBeenCalled();
  });
});
