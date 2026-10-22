/**
 * LEAD 443.243 — fail-old: isFillCertain must reject held_* / missing truck|load.
 */
import { describe, expect, it } from "vitest";
import { isFillCertain } from "../fuel-assignment-question.service.js";
import type { FillResolution } from "../fill-truck-and-load.service.js";

function base(over: Partial<FillResolution> = {}): FillResolution {
  return {
    truck_unit_id: "u1",
    engine_load_id: "l1",
    truck_resolution: "card_truck",
    load_resolution: "card_truck_window",
    moment_source: "provider",
    candidates: [],
    ...over,
  } as FillResolution;
}

describe("fuel-assignment-question isFillCertain (443.243)", () => {
  it("certain when truck + load resolved and not held", () => {
    expect(isFillCertain(base())).toBe(true);
  });

  it("uncertain when truck is held", () => {
    expect(isFillCertain(base({ truck_resolution: "held_ambiguous_gps" }))).toBe(false);
  });

  it("uncertain when load is held", () => {
    expect(isFillCertain(base({ load_resolution: "held_no_window" }))).toBe(false);
  });

  it("uncertain when truck missing", () => {
    expect(isFillCertain(base({ truck_unit_id: null }))).toBe(false);
  });

  it("uncertain when load missing", () => {
    expect(isFillCertain(base({ engine_load_id: null }))).toBe(false);
  });
});
