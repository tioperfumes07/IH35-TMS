import { describe, expect, it, vi } from "vitest";

const deliverInvoiceMock = vi.fn(async () => ({ message: "ok", qbo_id: "QBO-INV-1", qbo_sync_token: "3" }));

vi.mock("../../../qbo/push.service.js", () => ({
  deliverQboInvoicePush: deliverInvoiceMock,
}));

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const INVOICE_ID = "00000000-0000-4000-8000-0000000000d1";
const MIRROR_ID = "00000000-0000-4000-8000-0000000000d2";

function makeClient() {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices i")) {
        if (String(values?.[0] ?? "") !== INVOICE_ID) return { rows: [] };
        if (String(values?.[1] ?? "") !== TENANT_A) return { rows: [] };
        return {
          rows: [
            {
              invoice_id: INVOICE_ID,
              operating_company_id: TENANT_A,
              customer_id: "00000000-0000-4000-8000-0000000000c1",
              display_id: "INV-2026-00001",
              issue_date: "2026-05-23",
              due_date: "2026-06-22",
              total_cents: 120000,
              internal_notes: null,
              customer_notes: null,
              ar_email_snapshot: "ar@customer.com",
              qbo_invoice_id: null,
              qbo_sync_token: null,
              customer_qbo_id: "QBO-CUST-1",
              customer_billing_state: "CA",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoice_lines l")) {
        return {
          rows: [
            {
              line_id: "line-1",
              line_type: "linehaul",
              description: "Freight",
              quantity: "1",
              unit_amount_cents: 120000,
              line_total_cents: 120000,
              qbo_item_id: "QBO-ITEM-1",
              qbo_class_snapshot: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.qbo_invoices") && sql.includes("invoice_id = $2::uuid")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_invoices")) return { rows: [{ id: MIRROR_ID }] };
      if (sql.includes("SELECT qbo_id, qbo_sync_token") && sql.includes("FROM mdata.qbo_invoices")) {
        return { rows: [{ qbo_id: "QBO-INV-1", qbo_sync_token: "3" }] };
      }
      if (sql.includes("UPDATE accounting.invoices") && sql.includes("qbo_invoice_id")) return { rows: [] };
      if (sql.includes("audit.append_event")) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe("TMS invoice push tenant isolation", () => {
  it("refuses cross-tenant payload when invoice is not tenant-visible", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
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
          invoice_id: INVOICE_ID,
          operation: "update",
        },
        ctx,
      ),
    ).rejects.toThrow("tms_invoice_missing");
    expect(deliverInvoiceMock).not.toHaveBeenCalled();
  });

  it("allows matching-tenant payload and pushes invoice", async () => {
    const { TmsInvoicePushHandler } = await import("../tms-invoice-push.handler.js");
    const handler = new TmsInvoicePushHandler();
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
          invoice_id: INVOICE_ID,
          operation: "create",
        },
        ctx,
      ),
    ).resolves.toEqual({ message: "ok" });

    expect(deliverInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT_A,
      }),
      expect.any(Object),
    );
  });
});
