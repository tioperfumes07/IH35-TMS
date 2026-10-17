/**
 * LEAD 443.198 — a Relay fill's fuel records come from the fill's OWN lines (discounted amount, gallons, product; DEF its
 * own row), never from the amount typed off the printed settlement. Fail-old: on origin/main the Settlement Creator wrote
 * the Relay row at netCents (the PUMP price) and no DEF row — settlements 5839-5842, 24 fills (e.g. $1.35 recorded vs
 * $29.84 Relay paid).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planRelayFillFuelRows, relayFillRowsFromLines, writeRelayFillFuelRows, RelayFillFuelRowsError, type RelayFillLineRaw } from "../relay-fill-fuel-rows.js";

const L = (o: Partial<RelayFillLineRaw>): RelayFillLineRaw => ({
  id: "line-1", line_index: 0, fuel_type: "diesel", fuel_product_code: null, fuel_type_description: null,
  volume: "100.000", volume_uom: "gallons", discounted_price_per_unit_cents: "500", total_discounted_price_cents: "50000",
  fee_amount_cents: "0", ...o,
});
const FILL = { relay_fill_id: "fill-1", transaction_id: "txn_test" };

describe("relayFillRowsFromLines (443.198)", () => {
  it("the measured 8b6ffdd3 shape: DEF $28.65 + diesel $1.19 = Relay paid $29.84 -> two rows, DEF its own fuel_type", () => {
    const rows = relayFillRowsFromLines(FILL, [
      L({ id: "a", line_index: 0, fuel_type: "def", volume: "5.860", total_discounted_price_cents: "2865", discounted_price_per_unit_cents: "489", fee_amount_cents: "200" }),
      L({ id: "b", line_index: 1, fuel_type: "diesel", volume: "0.222", total_discounted_price_cents: "119", discounted_price_per_unit_cents: "536" }),
    ], { fuelPaidCents: 2984, feeCents: 200 });
    expect(rows.map((r) => [r.fuel_type, r.total_cents, r.gallons, r.fee_cents])).toEqual([["def", 2865, 5.86, 200], ["diesel", 119, 0.222, 0]]);
    expect(rows.reduce((s, r) => s + r.total_cents, 0)).toBe(2984);
  });

  it("reefer by Relay's product code is reefer_diesel", () => {
    const rows = relayFillRowsFromLines(FILL, [L({ fuel_type: "other", fuel_product_code: "033" })], { fuelPaidCents: 50000, feeCents: 0 });
    expect(rows[0]!.fuel_type).toBe("reefer_diesel");
  });

  it("lines that do not foot to Relay's paid are refused by name — never a typed amount", () => {
    expect(() => relayFillRowsFromLines(FILL, [L({})], { fuelPaidCents: 59000, feeCents: 200 })).toThrow(/sum to 50000 cents but Relay paid 59000/);
  });

  it("a fill with no product amount is refused", () => {
    expect(() => relayFillRowsFromLines(FILL, [L({ total_discounted_price_cents: "0" })], { fuelPaidCents: 0, feeCents: 0 })).toThrow(RelayFillFuelRowsError);
  });

  it("two lines of the same product are refused (one row per product per ticket)", () => {
    expect(() => relayFillRowsFromLines(FILL, [L({ id: "a" }), L({ id: "b", line_index: 1 })], { fuelPaidCents: 100000, feeCents: 0 })).toThrow(/two diesel lines/);
  });
});

describe("writeRelayFillFuelRows (443.198)", () => {
  it("writes one row per Relay line at the discounted amount, keyed on the line, the fee on the first row", async () => {
    const inserts: unknown[][] = [];
    const dupChecks: string[] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM integrations\.relay_fuel_transactions\b/.test(sql)) {
          return { rows: [{ transaction_id: "txn_A", total_amount_paid_cents: "57208", fees: [{ amount: "2.00", type: "sender_fee" }], ingest_source: "daily_pull" }] };
        }
        if (/FROM integrations\.relay_fuel_transaction_lines/.test(sql)) {
          return { rows: [
            L({ id: "l0", line_index: 0, fuel_type: "def", volume: "2.543", total_discounted_price_cents: "1218", discounted_price_per_unit_cents: "479", fee_amount_cents: "200" }),
            L({ id: "l1", line_index: 1, fuel_type: "diesel", volume: "101.334", total_discounted_price_cents: "55990", discounted_price_per_unit_cents: "553" }),
          ] };
        }
        if (/INSERT INTO fuel\.fuel_transactions/.test(sql)) {
          expect(dupChecks).toEqual(["def", "diesel"]); // every product refused-if-recorded BEFORE the first insert

          inserts.push(params);
          return { rows: [{ id: `row-${inserts.length}` }] };
        }
        if (/FROM fuel\.fuel_transactions/.test(sql)) {
          dupChecks.push(String(params.find((x) => x === "def" || x === "diesel")));
          return { rows: [] };
        }
        throw new Error(`unexpected SQL ${sql.slice(0, 60)}`);
      },
    };
    const rows = await writeRelayFillFuelRows(client as never, {
      operatingCompanyId: "co", relayFillId: "fill", vendorId: "v", loadId: "load", driverId: "d", unitId: "u", reeferTrailerId: null,
      reference: "1768232", purchasedAt: "2026-10-05T12:00:00.000Z", locationCity: null, loadExemptionReason: null, actorUserId: "user",
      sourceDocId: null, notes: null,
    });
    expect(rows.map((r) => [r.id, r.fuel_type, r.total_cents])).toEqual([["row-1", "def", 1218], ["row-2", "diesel", 55990]]);
    // total_cost (dollars) per row = Relay's discounted line; the two rows sum to what Relay paid ($572.08)
    expect(inserts.map((p) => [p[5], p[8], p[9], p[16]])).toEqual([
      ["def", 12.18, 2, "relay-line:co:l0"],
      ["diesel", 559.9, 0, "relay-line:co:l1"],
    ]);
    expect(inserts.every((p) => p[20] === "fill")).toBe(true);
    const plan = await planRelayFillFuelRows(client as never, "co", "fill");
    expect(plan.fuel_paid_cents).toBe(57208);
  });
});

describe("Settlement Creator Relay rows (443.198, source)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../driver-finance/settlement-creator.service.ts"), "utf8");
  it("the Creator writes a Relay fill's rows through writeRelayFillFuelRows and never inserts a Relay row at netCents", () => {
    expect(src).toMatch(/await writeRelayFillFuelRows\(client as never, \{/);
    expect(src).toMatch(/relayRowId \? \{ rows: \[\{ id: relayRowId \}\] \}/);
    expect(src).toMatch(/"relay_fill_product_absent"/);
  });
});
