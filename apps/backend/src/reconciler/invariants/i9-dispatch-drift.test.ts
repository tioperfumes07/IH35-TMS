import { describe, expect, it } from "vitest";
import { I9_SQL, i9ExceptionsForRow } from "./i9-dispatch-drift.js";

const NOW = Date.parse("2026-10-24T20:00:00Z");
const base = {
  load_id: "00000000-0000-0000-0000-000000000001",
  load_number: "13693",
  load_created_at: "2026-10-21T23:00:00Z",
  unit_number: "T177",
  charge_cents: "320000",
  active_charges: "1",
  next_stop_label: "Delivery Edison, NJ",
  next_stop_due_at: "2026-10-26T14:00:00Z",
  miles_to_next_stop: "40",
  position_at: "2026-10-24T19:40:00Z",
  undated_stops: null,
  streetless_stops: null,
};
const fields = (row: Partial<typeof base>) => i9ExceptionsForRow({ ...base, ...row }, NOW).map((e) => e.field);

describe("I9 dispatch drift (LEAD 443.327)", () => {
  it("a complete load near its next stop is clean", () => {
    expect(fields({})).toEqual([]);
  });
  it("the Infante case: 1,550 mi from Edison NJ with the appointment passed", () => {
    const ex = i9ExceptionsForRow({ ...base, miles_to_next_stop: "1550", next_stop_due_at: "2026-10-23T14:00:00Z" }, NOW);
    expect(ex.map((e) => e.field)).toEqual(["truck_cannot_make_next_stop"]);
    expect(ex[0].reason).toContain("T177 is 1,550 miles from Delivery Edison, NJ");
    expect(ex[0].reason).toContain("appointment has passed");
    expect(ex[0].entity_label).toBe("13693");
  });
  it("too far to make it in time (> 600 mi a day) is drift; reachable is not", () => {
    expect(fields({ miles_to_next_stop: "1700", next_stop_due_at: "2026-10-26T20:00:00Z" })).toEqual(["truck_cannot_make_next_stop"]); // 850/day
    expect(fields({ miles_to_next_stop: "1000", next_stop_due_at: "2026-10-26T20:00:00Z" })).toEqual([]); // 500/day
  });
  it("within 75 miles never flags, even late", () => {
    expect(fields({ miles_to_next_stop: "60", next_stop_due_at: "2026-10-23T14:00:00Z" })).toEqual([]);
  });
  it("no position or no due time cannot judge distance", () => {
    expect(fields({ miles_to_next_stop: null, next_stop_due_at: "2026-10-23T14:00:00Z" })).toEqual([]);
    expect(fields({ miles_to_next_stop: "1550", next_stop_due_at: null })).toEqual([]);
  });
  it("missing date, street address and rate each flag until fixed", () => {
    expect(fields({ undated_stops: "Pickup Laredo; Delivery Edison" })).toEqual(["stop_no_date"]);
    expect(fields({ streetless_stops: "Delivery Bradley" })).toEqual(["stop_no_street_address"]);
    expect(fields({ active_charges: "0", charge_cents: "0" })).toEqual(["load_no_amount"]);
    expect(fields({ active_charges: "1", charge_cents: "0" })).toEqual(["load_no_amount"]);
  });
  it("reads only active charge lines, fresh positions and the canonical active set", () => {
    expect(I9_SQL).toContain("c.is_active = true");
    expect(I9_SQL).toContain("interval '3 hours'");
    expect(I9_SQL).toContain("integrations.samsara_vehicle_positions");
    expect(I9_SQL).toMatch(/geocode_precision = 'locality'/);
  });
});
