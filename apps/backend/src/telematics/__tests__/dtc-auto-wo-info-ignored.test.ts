import { describe, expect, it, vi } from "vitest";
import { processDtcAutoWorkOrderEvent } from "../dtc-auto-work-order.service.js";

describe("dtc auto work order info ignored", () => {
  it("does not create work order for info/minor DTCs", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const created = await processDtcAutoWorkOrderEvent(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: "2026-05-24T00:00:00.000Z",
      dtc_code: "B1234",
      description: "Body module",
    });
    expect(created).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });
});
