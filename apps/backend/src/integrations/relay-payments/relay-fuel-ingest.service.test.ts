import { describe, expect, it, vi } from "vitest";
import { RelayRowRejectedError, type RelayFuelTransaction } from "./relay-client.js";
import type { DbClient } from "./db-client.type.js";
import { upsertRelayFuelTransaction } from "./relay-fuel-ingest.service.js";

const tx = (over: Partial<RelayFuelTransaction> = {}): RelayFuelTransaction => ({
  transaction_id: "txn-1",
  created_at: "2026-10-01T12:00:00Z",
  relay_fuel_code: null,
  total_amount_paid: "182.44",
  total_retail_price: "190.00",
  total_amount_saved: null,
  is_direct_bill: null,
  currency_code: "USD",
  cash_advance: null,
  fuel_code_type: null,
  linked_org: null,
  driver: null,
  merchant: null,
  location: null,
  prompts: [],
  fuel_items: [],
  fees: [],
  products: [],
  ...over,
});

/** Records every statement; answers the owner/held-elsewhere reads as "unresolved, not held". */
function recordingClient() {
  const sql: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      sql.push(text);
      if (text.includes("EXISTS")) return { rows: [{ ok: false }] };
      return { rows: [] };
    }),
  } as unknown as DbClient;
  return { client, sql, writes: () => sql.filter((s) => /\b(INSERT|UPDATE)\b/.test(s)) };
}

describe("upsertRelayFuelTransaction — money is refused before the first write", () => {
  it("rejects a non-dollar-string total and writes nothing", async () => {
    const { client, writes } = recordingClient();
    await expect(
      upsertRelayFuelTransaction(client, "opco", tx({ total_amount_paid: 182.44 as unknown as string }), "daily_pull")
    ).rejects.toBeInstanceOf(RelayRowRejectedError);
    expect(writes()).toEqual([]);
  });

  it("rejects a bad line-item amount before the header is written (no half-written fill)", async () => {
    const { client, writes } = recordingClient();
    const bad = tx({
      fuel_items: [
        {
          fuel_type: "diesel",
          fuel_type_description: null,
          fuel_product_code: null,
          retail_price_per_unit: "3.899",
          discounted_price_per_unit: null,
          volume: "46.8",
          volume_uom: "gallon",
          total_retail_price: "1,234.00",
          total_discounted_price: null,
          fee: null,
        },
      ],
    });
    await expect(upsertRelayFuelTransaction(client, "opco", bad, "webhook")).rejects.toThrow(/fuel_items\[0\]\.total_retail_price/);
    expect(writes()).toEqual([]);
  });

  it("matches the driver on integration_id only and reports why it stayed unresolved", async () => {
    const { client, sql } = recordingClient();
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      sql.push(text);
      if (text.includes("EXISTS")) return { rows: [{ ok: false }] };
      if (text.includes("INSERT INTO integrations.relay_fuel_transactions")) return { rows: [{ id: "rft-1" }] };
      return { rows: [] };
    });
    const res = await upsertRelayFuelTransaction(
      client,
      "opco",
      tx({ driver: { id: "relay-77", first_name: "Ruben", last_name: "Garcia", phone: "+12108893066", email: "r@x.test", integration_id: null } }),
      "daily_pull"
    );
    expect(res.matched_driver_id).toBeNull();
    expect(res.driver_unresolved_reason).toBe("relay_integration_id_missing");
    // no read of mdata.drivers by phone or name happened
    expect(sql.some((s) => s.includes("mdata.drivers"))).toBe(false);
  });
});
