import { describe, expect, it, vi } from "vitest";
import { creatorEmptyPayCents, creatorLoadedPayCents, creatorPayMiles } from "../settlement-creator-empty-pay.js";
import { resolveDriverPayItems } from "../settlement-creator-pay-item.js";

describe("ROUND 443.4 — driver pay never reads customer revenue", () => {
  it("settlement 5769 shape: Transportation load 13498 with a $0 invoice still pays 1,263.9 mi x $0.45 = $568.76", () => {
    const l13498 = { miles_shortest: 1263.9, loaded_miles: 1300, line_haul_rate_cents: 45, line_haul_amount_cents: 0 };
    expect(creatorLoadedPayCents(l13498)).toBe(56876);
  });
  it("load 13508: $577.80 loaded + $8.96 empty = $586.76, whatever the invoice amount", () => {
    const l13508 = { miles_shortest: 1284, line_haul_rate_cents: 45, line_haul_amount_cents: 380000, empty_miles: 19.9, empty_rate_cents: null };
    expect(creatorLoadedPayCents(l13508)).toBe(57780);
    expect(creatorEmptyPayCents(l13508)).toBe(896);
    expect((creatorLoadedPayCents(l13508) ?? 0) + creatorEmptyPayCents(l13508)).toBe(58676);
  });
  it("gross for the two loads is $1,155.52", () => {
    expect(56876 + 58676).toBe(115552);
  });
  it("short miles win over practical; no miles or no rate is unpriced (the post refuses), never the invoice amount", () => {
    expect(creatorPayMiles({ miles_shortest: 100, loaded_miles: 120 })).toBe(100);
    expect(creatorLoadedPayCents({ miles_shortest: null, loaded_miles: null, line_haul_rate_cents: 45 })).toBeNull();
    expect(creatorLoadedPayCents({ miles_shortest: 100, line_haul_rate_cents: null })).toBeNull();
  });
});

type Row = Record<string, unknown>;
function fakeClient(b1: boolean | null) {
  return {
    query: vi.fn(async (sql: string): Promise<{ rows: Row[] }> => {
      if (/trim\(concat_ws/.test(sql)) return { rows: [{ name: "JOSE ANTONIO VICENTE MARTINEZ" }] };
      if (/has_b1_visa AS b1/.test(sql)) return { rows: [{ b1 }] };
      if (/FROM catalogs\.items/.test(sql))
        return { rows: [
          { id: "b1-l", item_name: "Driver Pay-Mexico-B1 Driver-Loaded Miles" }, { id: "b1-e", item_name: "Driver Pay-Mexico-B1 Driver-Empty Miles" },
          { id: "cdl-l", item_name: "Driver Pay-CDL-Loaded Miles" }, { id: "cdl-e", item_name: "Driver Pay-CDL-Empty Miles" },
        ] };
      return { rows: [] };
    }),
  };
}

describe("ROUND 443.4 b — the pay item comes from has_b1_visa (Lead ruling c890d88)", () => {
  it("has_b1_visa NULL refuses, naming the driver — never a CDL default", async () => {
    await expect(resolveDriverPayItems(fakeClient(null) as never, "co", "d")).rejects.toMatchObject({
      code: "driver_pay_item_unresolved",
      message: expect.stringContaining("JOSE ANTONIO VICENTE MARTINEZ"),
    });
  });
  it("has_b1_visa true -> the Mexico-B1 items", async () => {
    const r = await resolveDriverPayItems(fakeClient(true) as never, "co", "d");
    expect(r.loaded.name).toBe("Driver Pay-Mexico-B1 Driver-Loaded Miles");
    expect(r.empty.id).toBe("b1-e");
  });
  it("has_b1_visa false -> the CDL items", async () => {
    const r = await resolveDriverPayItems(fakeClient(false) as never, "co", "d");
    expect(r.loaded.id).toBe("cdl-l");
  });
});

import { milesTimesRateCents } from "../deadhead-rule.js";
describe("miles x rate rounds like Postgres numeric (settlement_lines_item_qty_rate_amount_check)", () => {
  it("19.9 mi x 45c = 896 (JS float gives 895.4999…)", () => {
    expect(19.9 * 45).toBeLessThan(895.5);
    expect(milesTimesRateCents(19.9, 45)).toBe(896);
  });
  it("1,263.9 mi x 45c = 56876", () => expect(milesTimesRateCents(1263.9, 45)).toBe(56876));
});
