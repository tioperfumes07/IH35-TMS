import { describe, expect, it, vi } from "vitest";
import { mintProformaInvoiceOnFirstPickup } from "../proforma-mint-on-first-pickup.js";

function clientWithRows(handlers: Array<(sql: string) => { rows: unknown[] }>) {
  let i = 0;
  return {
    query: vi.fn(async (sql: string) => {
      const h = handlers[i++];
      if (!h) return { rows: [] };
      return h(sql);
    }),
  };
}

describe("mintProformaInvoiceOnFirstPickup", () => {
  it("skips when the stamped stop is not the first pickup", async () => {
    const client = clientWithRows([
      () => ({ rows: [] }),
      () => ({ rows: [{ id: "first-pickup", actual_arrival_at: "2026-09-02T12:00:00Z", actual_departure_at: null }] }),
    ]);
    const result = await mintProformaInvoiceOnFirstPickup(client, {
      operatingCompanyId: "co",
      loadId: "load",
      actorUserId: "user",
      stopId: "delivery-stop",
    });
    expect(result).toEqual({ outcome: "skipped", reason: "not_first_pickup" });
  });

  it("skips when first pickup has no arrival or departure", async () => {
    const client = clientWithRows([
      () => ({ rows: [] }),
      () => ({ rows: [{ id: "first-pickup", actual_arrival_at: null, actual_departure_at: null }] }),
    ]);
    const result = await mintProformaInvoiceOnFirstPickup(client, {
      operatingCompanyId: "co",
      loadId: "load",
      actorUserId: "user",
      stopId: "first-pickup",
    });
    expect(result).toEqual({ outcome: "skipped", reason: "pickup_not_completed" });
  });
});
