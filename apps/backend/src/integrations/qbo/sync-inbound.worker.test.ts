import { describe, it, expect, vi } from "vitest";
import { evaluateInboundVersusTms } from "./sync-inbound-apply-guard.js";

describe("sync inbound TMS guard", () => {
  it("returns conflict when invoice qbo_sync_pending", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM accounting.invoices")) {
          return {
            rows: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                total_cents: "1000",
                amount_paid_cents: "0",
                status: "sent",
                issue_date: "2026-01-01",
                due_date: "2026-02-01",
                updated_at: new Date().toISOString(),
                last_qbo_synced_at: null,
                qbo_sync_pending: true,
                line_count: "1",
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO integrations.qbo_sync_conflicts")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const blocked = await evaluateInboundVersusTms({
      client: client as never,
      operating_company_id: "00000000-0000-4000-8000-000000000001",
      qbo_entity_type: "Invoice",
      qbo_entity_id: "qb-1",
      entity_payload: { TotalAmt: 10, Balance: 10, Line: [{ DetailType: "SalesItemLineDetail" }] },
    });
    expect(blocked).toBe(true);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO integrations.qbo_sync_conflicts"), expect.any(Array));
  });
});
