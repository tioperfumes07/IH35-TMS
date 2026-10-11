import { describe, expect, it } from "vitest";
import { resolvePostingSourceEntity, resolvePostingSourceLoad } from "../posting-line-writer.js";

// 443.42 #6: Relay documents name the vendor Relay (deposit: every leg; fill: its lines) and a Relay fill carries its
// fill's load through fuel.fuel_transactions.relay_fuel_transaction_id — one load, never a guess.

const DEP = "11111111-1111-4111-8111-111111111111";
const FILL = "22222222-2222-4222-8222-222222222222";
const FT = "33333333-3333-4333-8333-333333333333";

function client(opts: { relayFill?: boolean; loads?: string[]; vendors?: string[]; ftVendor?: string | null } = {}) {
  return {
    query: async (sql: string) => {
      if (/FROM integrations\.relay_deposits/.test(sql)) return { rows: [{ c: "co" }] };
      if (/SELECT 1 AS one FROM integrations\.relay_fuel_transactions/.test(sql)) return { rows: opts.relayFill ? [{ one: 1 }] : [] };
      if (/FROM integrations\.relay_fuel_transactions/.test(sql)) return { rows: [{ c: "co" }] };
      if (/FROM mdata\.vendors/.test(sql)) return { rows: (opts.vendors ?? ["vendor-relay"]).map((id) => ({ id })) };
      if (/SELECT vendor_id::text AS e FROM fuel\.fuel_transactions/.test(sql)) return { rows: [{ e: opts.ftVendor ?? null }] };
      if (/FROM fuel\.fuel_transactions ft/.test(sql)) return { rows: (opts.loads ?? []).map((load_id) => ({ load_id })) };
      throw new Error(`unhandled: ${sql}`);
    },
  } as never;
}

describe("Relay entity + load at post time (443.42 #6)", () => {
  it("every leg of a Relay deposit names the vendor Relay", async () => {
    expect(await resolvePostingSourceEntity(client(), { source_transaction_type: "relay_deposit", source_transaction_id: DEP, reversal_of_line_id: null } as never))
      .toEqual({ entity_uuid: "vendor-relay", entity_type: "vendor" });
  });
  it("a Relay fill names the vendor Relay and carries its one load", async () => {
    const line = { source_transaction_type: "fuel_event", source_transaction_id: FILL, reversal_of_line_id: null } as never;
    expect(await resolvePostingSourceEntity(client({ relayFill: true }), line)).toEqual({ entity_uuid: "vendor-relay", entity_type: "vendor" });
    expect(await resolvePostingSourceLoad(client({ loads: ["load-1"] }), line)).toBe("load-1");
  });
  it("a fill split across two loads is not guessed; no or two Relay vendors name nobody", async () => {
    const line = { source_transaction_type: "fuel_event", source_transaction_id: FILL, reversal_of_line_id: null } as never;
    expect(await resolvePostingSourceLoad(client({ loads: ["load-1", "load-2"] }), line)).toBeNull();
    expect(await resolvePostingSourceEntity(client({ relayFill: true, vendors: [] }), line)).toBeNull();
    expect(await resolvePostingSourceEntity(client({ relayFill: true, vendors: ["a", "b"] }), line)).toBeNull();
  });
  it("a non-Relay fuel event names its fuel transaction's vendor; other sources get no TS load", async () => {
    expect(await resolvePostingSourceEntity(client({ relayFill: false, ftVendor: "vendor-loves" }), { source_transaction_type: "fuel_event", source_transaction_id: FT, reversal_of_line_id: null } as never))
      .toEqual({ entity_uuid: "vendor-loves", entity_type: "vendor" });
    expect(await resolvePostingSourceLoad(client(), { source_transaction_type: "bill", source_transaction_id: FT, reversal_of_line_id: null } as never)).toBeNull();
  });
});
