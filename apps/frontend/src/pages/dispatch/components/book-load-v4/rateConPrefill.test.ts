import { describe, expect, it } from "vitest";
import { rateConExtractionToPrefill } from "./rateConPrefill";
import type { RateConExtraction } from "../../../../api/ratecon";

const extraction: RateConExtraction = {
  broker: { name: "ACME Logistics", mc_number: "MC123456", address: null, phone: null, email: null, contact_name: "Sam" },
  load_reference: ["RC-9001"],
  stops: [
    { type: "pickup", name: "Shipper Co", address: "1 Dock Rd", city: "Laredo", state: "TX", zip: "78040", date: "2026-07-05", time_window: "08:00-12:00", appointment_required: true },
    { type: "delivery", name: null, address: null, city: "Dallas", state: "TX", zip: null, date: "2026-07-06", time_window: null, appointment_required: false },
  ],
  equipment: "Dry Van 53'",
  commodity: "Auto parts",
  weight: "42000 lb",
  rate: { linehaul_cents: 120000, fuel_surcharge_cents: 30000, accessorials: [{ label: "Detention", amount_cents: 5000 }], total_cents: 155000 },
  payment_terms: "Net 30",
  notes: "No touch freight",
  field_confidence: { broker: "high", rate: "medium", weight: "low" },
};

describe("rateConExtractionToPrefill", () => {
  it("maps rate fields to integer-cent form keys", () => {
    const p = rateConExtractionToPrefill(extraction);
    expect(p.json.linehaul_cents).toBe(120000);
    expect(p.json.fuel_surcharge_cents).toBe(30000);
    expect(p.json.accessorial_cents).toBe(5000);
    expect(p.json.customer_name).toBe("ACME Logistics");
  });

  it("maps stops with type + appointment → time_window_type, 1-based sequence", () => {
    const p = rateConExtractionToPrefill(extraction);
    const stops = p.json.stops as Array<Record<string, unknown>>;
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ stop_type: "pickup", city: "Laredo", state: "TX", sequence_number: 1, time_window_type: "appointment" });
    expect(stops[1]).toMatchObject({ stop_type: "delivery", city: "Dallas", sequence_number: 2, time_window_type: "open_window" });
  });

  it("surfaces the broker fuzzy-match target and low-confidence fields", () => {
    const p = rateConExtractionToPrefill(extraction);
    expect(p.brokerMatch).toEqual({ name: "ACME Logistics", mc_number: "MC123456" });
    expect(p.lowConfidenceFields).toEqual(["weight"]);
  });

  it("folds commodity/weight/equipment/terms/ref into notes for dispatcher review", () => {
    const p = rateConExtractionToPrefill(extraction);
    const notes = String(p.json.notes);
    expect(notes).toContain("Commodity: Auto parts");
    expect(notes).toContain("Ref: RC-9001");
  });
});
