import { describe, expect, it, vi } from "vitest";
import { RelayRowRejectedError, type RelayFuelTransaction } from "./relay-client.js";
import type { DbClient } from "./db-client.type.js";
import { upsertRelayFuelTransaction } from "./relay-fuel-ingest.service.js";
import { USMCA_OPERATING_COMPANY_ID as USMCA } from "./relay-usmca-date-floor.js";

const TRANSP = "91e0bf0a-0000-4000-8000-000000000000";

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
      upsertRelayFuelTransaction(client, USMCA, tx({ total_amount_paid: 182.44 as unknown as string }), "daily_pull")
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
    await expect(upsertRelayFuelTransaction(client, USMCA, bad, "webhook")).rejects.toThrow(/fuel_items\[0\]\.total_retail_price/);
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
      USMCA,
      tx({ driver: { id: "relay-77", first_name: "Ruben", last_name: "Garcia", phone: "+12108893066", email: "r@x.test", integration_id: null } }),
      "daily_pull"
    );
    expect(res.matched_driver_id).toBeNull();
    expect(res.driver_unresolved_reason).toBe("relay_integration_id_missing");
    // no read of mdata.drivers by phone or name happened
    expect(sql.some((s) => s.includes("mdata.drivers"))).toBe(false);
  });
});

// ROUND 443.15 (owner, 2026-10-10): a Relay fill is stored once, under USMCA only.
describe("upsertRelayFuelTransaction — one fill, one company, USMCA only (443.15)", () => {
  const truck = { prompts: [{ label: "Truck #", value: "T-101" }] } as Partial<RelayFuelTransaction>;

  it("a non-USMCA company stores nothing and reads nothing", async () => {
    const { client, sql } = recordingClient();
    const res = await upsertRelayFuelTransaction(client, TRANSP, tx(truck), "daily_pull");
    expect(res.skipped_reason).toBe("not_usmca_relay_company");
    expect(res.relay_fuel_transaction_id).toBeNull();
    expect(sql).toEqual([]);
  });

  it("the 2026-10-08 shape: unit resolves to USMCA but another company already holds the fill -> skipped, nothing written", async () => {
    const { client, sql, writes } = recordingClient();
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      sql.push(text);
      if (text.includes("EXISTS")) return { rows: [{ ok: true }] };
      if (text.includes("mdata.units")) return { rows: [{ company: USMCA }] };
      return { rows: [] };
    });
    const res = await upsertRelayFuelTransaction(client, USMCA, tx(truck), "daily_pull");
    expect(res.skipped_reason).toBe("already_held_by_other_company");
    expect(writes()).toEqual([]);
  });

  it("unit resolves to USMCA and no other company holds the fill -> stored under USMCA", async () => {
    const { client, sql } = recordingClient();
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      sql.push(text);
      if (text.includes("EXISTS")) return { rows: [{ ok: false }] };
      if (text.includes("mdata.units")) return { rows: [{ company: USMCA }] };
      if (text.includes("INSERT INTO integrations.relay_fuel_transactions")) return { rows: [{ id: "rft-9" }] };
      return { rows: [] };
    });
    const res = await upsertRelayFuelTransaction(client, USMCA, tx(truck), "daily_pull");
    expect(res.skipped_reason).toBeNull();
    expect(res.relay_fuel_transaction_id).toBe("rft-9");
  });
});
