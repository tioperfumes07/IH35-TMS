// LEAD 443.258-A (P0 D001): every candidate the question API returns carries `load` (object or null) — including the
// prod question c5a43b1d whose stored evidence has the flat legacy shape (load_number on the candidate, no `load`).
import { describe, expect, it } from "vitest";
import { normalizeCandidate, normalizeQuestionRow, type FuelCandidateTruck } from "../fuel-assignment-question.service.js";

const prodFlat = {
  evidence: {
    candidates: [{ note: "No GPS truck at station", odometer: null, load_number: "13689", unit_number: "T173", samsara_driver: "X", gps_distance_mi: null, gps_minutes_off: null }],
    load_resolution: "held_no_gps_at_station",
    truck_resolution: "owner_ruling",
  },
};

describe("fuel question evidence normalization (443.258-A)", () => {
  it("maps the stored flat shape to a load object", () => {
    // normalizeQuestionRow<T> is typed as T (the stored shape); read its candidates as the normalized type it returns.
    const row = normalizeQuestionRow(prodFlat) as unknown as { evidence: { candidates: FuelCandidateTruck[] } };
    expect(row.evidence.candidates[0].load).toEqual({ load_id: null, load_number: "13689", settlement_ref: null, pickup: null, delivery: null, route: null });
    expect(row.evidence.candidates[0]).toHaveProperty("load");
  });
  it("a candidate with no load at all gets load: null — never an omitted key", () => {
    const c = normalizeCandidate({ unit_id: "u1", unit_number: "T1" });
    expect(c).toHaveProperty("load", null);
    expect(normalizeCandidate({ unit_id: "u1", load: { load_id: null, load_number: null } }).load).toBeNull();
  });
  it("keeps a proper nested load", () => {
    expect(normalizeCandidate({ unit_id: "u1", load: { load_id: "l1", load_number: "13700", settlement_ref: "5870", route: "A → B" } }).load)
      .toMatchObject({ load_id: "l1", load_number: "13700", settlement_ref: "5870", route: "A → B" });
  });
  it("missing evidence never throws", () => {
    expect(normalizeQuestionRow({ evidence: null }).evidence.candidates).toEqual([]);
  });
});
