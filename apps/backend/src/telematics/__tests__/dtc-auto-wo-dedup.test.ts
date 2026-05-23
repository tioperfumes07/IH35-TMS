import { describe, expect, it, vi } from "vitest";
import { processDtcAutoWorkOrderEvent } from "../dtc-auto-work-order.service.js";

describe("dtc auto work order dedupe", () => {
  it("skips creating duplicate open work order", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM maintenance.work_orders w")) {
          return { rows: [{ id: "existing-wo" }] };
        }
        return { rows: [] };
      }),
    };

    const created = await processDtcAutoWorkOrderEvent(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: "2026-05-24T00:00:00.000Z",
      dtc_code: "P0700",
      description: "Transmission control system",
    });

    expect(created).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
