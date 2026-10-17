import { describe, expect, it } from "vitest";
import { batchPayMiles, toLoadBlock } from "../batch-settlements.service.js";
import { listDriverBillsForSettlementPeriod } from "../settlements.service.js";
import { creatorLoadedPayCents, creatorPayMiles } from "../settlement-creator-empty-pay.js";

// OWNER LAW (LEAD 443.192, 12:35Z/13:25Z): "Per-mile drivers are ALWAYS paid SHORT miles — never practical miles."
const base = {
  load_id: "L1", load_number: "13631", customer_id: null, customer_name: "ACME", unit_id: null, unit_number: null, trailer_id: null,
  trip_type: "NB", status: "delivered", pickup_date: "2026-10-01", delivery_date: "2026-10-03", pickup_city: null, delivery_city: null,
  miles_practical: 1100, miles_shortest: 1000, loaded_miles: 1000, empty_miles: null, rate_total_cents: 380_000,
  driver_pay_rate_per_mile: 0.5, presettlement_link_id: "P", already_on_closed_settlement: false,
  bill_loaded_pay_cents: null, bill_rate_per_mile_cents: null, bill_miles_basis: null, bill_miles_basis_type: null,
  bill_miles_deadhead: null, bill_rate_empty_per_mile_cents: null,
};

describe("443.192 — batch settlement pay miles are SHORT miles only", () => {
  it("no bill: pays the load's short miles, not practical", () => {
    const block = toLoadBlock({ ...base } as never);
    expect(block.line_haul_miles).toBe(1000);
    expect(block.miles_shortest).toBe(1000);
    expect(creatorPayMiles(block)).toBe(1000);
    expect(creatorLoadedPayCents(block)).toBe(50_000); // 1000 short mi x 50c — never 1100 practical
  });

  it("no short miles: never falls back to practical or the derived loaded_miles — the load is unpriced", () => {
    // loaded_miles here is what loadedMilesFor writes when short is missing: the PRACTICAL number.
    const block = toLoadBlock({ ...base, miles_shortest: null, loaded_miles: 1100 } as never);
    expect(block.line_haul_miles).toBeNull();
    expect(block.loaded_miles).toBeNull();
    expect(block.miles_shortest).toBeNull();
    expect(creatorLoadedPayCents(block)).toBeNull();
  });

  it("bill with a short basis: the bill's own basis prices the pay", () => {
    const load = { ...base, bill_loaded_pay_cents: 49_500, bill_rate_per_mile_cents: 45, bill_miles_basis: 1100, bill_miles_basis_type: "short" };
    expect(batchPayMiles(load as never)).toBe(1100);
    expect(toLoadBlock(load as never).line_haul_rate_cents).toBe(45);
  });

  it("bill whose basis is PRACTICAL: its miles never price pay — the load's short miles do", () => {
    const load = { ...base, bill_loaded_pay_cents: 49_500, bill_rate_per_mile_cents: 45, bill_miles_basis: 1100, bill_miles_basis_type: "practical" };
    const block = toLoadBlock(load as never);
    expect(block.line_haul_miles).toBe(1000);
    expect(creatorLoadedPayCents(block)).toBe(45_000);
    expect(batchPayMiles({ ...load, miles_shortest: null } as never)).toBeNull();
  });
});

describe("443.192 — settlement document pay miles / derived rate read SHORT miles only", () => {
  async function capturedSql(): Promise<string> {
    let sql = "";
    const client = {
      query: async (text: string) => {
        sql = text;
        return { rows: [] };
      },
    };
    await listDriverBillsForSettlementPeriod(client as never, {
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      driverId: "d",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-07",
    });
    // code only: SQL `--` comments may name a column in history notes
    return sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  }

  it("never reads miles_practical for miles_basis, the effective rate, or the label", async () => {
    const sql = await capturedSql();
    expect(sql).not.toMatch(/miles_practical/);
    expect(sql).not.toMatch(/'practical \(load\)'/);
    expect(sql).toMatch(/WHEN COALESCE\(dbl\.miles_shortest, 0\) > 0 THEN dbl\.miles_shortest/);
    expect(sql).toMatch(/NULLIF\(dbl\.miles_shortest, 0\)/);
  });

  it("a bill whose own basis is 'practical' does not supply the displayed pay miles", async () => {
    const sql = await capturedSql();
    expect(sql).toMatch(/db\.miles_basis IS NOT NULL AND db\.miles_basis_type IS DISTINCT FROM 'practical' THEN db\.miles_basis\b/);
  });
});
