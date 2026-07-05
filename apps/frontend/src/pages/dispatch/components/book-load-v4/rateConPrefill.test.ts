import { describe, expect, it } from "vitest";
import { rateConExtractionToPrefill, splitAddressTail } from "./rateConPrefill";
import type { RateConExtraction, RateConStop } from "../../../../api/ratecon";

// RATECON-4 — shared defaults for the fields added in this block so fixtures stay readable.
const NO_TERMS = {
  detention_rate_per_hour_cents: null,
  detention_free_hours: null,
  layover_per_day_cents: null,
  tonu_fee_cents: null,
};
function stop(s: Partial<RateConStop> & Pick<RateConStop, "type">): RateConStop {
  return {
    name: null, address: null, city: null, state: null, zip: null, date: null,
    time_window: null, appointment_required: null, pickup_number: null, po_number: null,
    ...s,
  };
}

const extraction: RateConExtraction = {
  broker: { name: "ACME Logistics", mc_number: "MC123456", address: null, phone: null, email: null, contact_name: "Sam", after_hours_phone: null, after_hours_email: null },
  load_reference: ["RC-9001"],
  stops: [
    stop({ type: "pickup", name: "Shipper Co", address: "1 Dock Rd", city: "Laredo", state: "TX", zip: "78040", date: "2026-07-05", time_window: "08:00-12:00", appointment_required: true }),
    stop({ type: "delivery", city: "Dallas", state: "TX", date: "2026-07-06", appointment_required: false }),
  ],
  equipment: "Dry Van 53'",
  commodity: "Auto parts",
  weight: "42000 lb",
  total_weight_lbs: 42000,
  pieces_count: null,
  pieces_unit: null,
  invoice_to_email: null,
  terms: NO_TERMS,
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
    expect(stops[0]).toMatchObject({ stop_type: "pickup", city: "Laredo", state: "TX", sequence_number: 1, time_window_type: "appointment", zip: "78040" });
    expect(stops[1]).toMatchObject({ stop_type: "delivery", city: "Dallas", sequence_number: 2, time_window_type: "open_window" });
  });

  it("surfaces the broker fuzzy-match target and low-confidence fields", () => {
    const p = rateConExtractionToPrefill(extraction);
    expect(p.brokerMatch).toMatchObject({ name: "ACME Logistics", mc_number: "MC123456", contact_name: "Sam" });
    expect(p.lowConfidenceFields).toEqual(["weight"]);
  });

  it("RATECON-4: maps commodity/weight/refs to DEDICATED fields (not the notes blob)", () => {
    const p = rateConExtractionToPrefill(extraction);
    expect(p.json.commodity).toBe("Auto parts");
    expect(p.json.weight_lbs).toBe(42000);
    // commodity/ref no longer buried in notes — notes only carries unmapped context (equipment/terms)
    const notes = String(p.json.notes);
    expect(notes).not.toContain("Commodity:");
    expect(notes).not.toContain("Ref:");
    expect(notes).toContain("Equipment: Dry Van 53'");
  });
});

describe("splitAddressTail — recover city/state/zip fused into the street", () => {
  it("splits '<street>, <City>, <ST> <ZIP>'", () => {
    expect(splitAddressTail("695 Summa Ave, Amityville, NY 11701")).toEqual({ line1: "695 Summa Ave", city: "Amityville", state: "NY", zip: "11701" });
  });
  it("splits without a zip", () => {
    expect(splitAddressTail("3909 S County Rd 1290, Midland, TX")).toEqual({ line1: "3909 S County Rd 1290", city: "Midland", state: "TX", zip: null });
  });
  it("leaves an already-split street untouched (no tail match)", () => {
    expect(splitAddressTail("1 Dock Rd")).toEqual({ line1: "1 Dock Rd", city: null, state: null, zip: null });
  });
  it("handles empty/undefined", () => {
    expect(splitAddressTail(null)).toEqual({ line1: "", city: null, state: null, zip: null });
  });
});

describe("toBookStop address recovery", () => {
  it("recovers city/state from a fused address when the model left city null", () => {
    const e: RateConExtraction = {
      ...extraction,
      stops: [
        stop({ type: "pickup", name: "Ship", address: "695 Summa Ave, Amityville, NY 11701" }),
        stop({ type: "delivery", address: "1 Dock Rd", city: "Dallas", state: "TX" }),
      ],
    };
    const stops = rateConExtractionToPrefill(e).json.stops as Array<Record<string, unknown>>;
    expect(stops[0].city).toBe("Amityville");
    expect(stops[0].state).toBe("NY");
    expect(stops[0].address_line1).toBe("695 Summa Ave");
    expect(stops[0].zip).toBe("11701");
    expect(stops[1].city).toBe("Dallas");
    expect(stops[1].address_line1).toBe("1 Dock Rd");
  });
});

// RATECON-4 — the REAL Neon Logistics extraction (GUARD-verified ground truth). Every field the owner
// reported missing on the live upload must now land in its own wizard field.
describe("RATECON-4 acceptance — Neon Logistics rate con", () => {
  const neon: RateConExtraction = {
    broker: {
      name: "Neon Logistics", mc_number: "1112163", address: "7000 E Camelback Rd, Scottsdale, AZ 85251",
      phone: "480-555-0100", email: "joey@neon-logistics.com", contact_name: "Joey Reed",
      after_hours_phone: "480-555-0199", after_hours_email: "dispatch@neon-logistics.com",
    },
    load_reference: ["31420-32017", "ss-0094-2540750"],
    stops: [
      stop({ type: "pickup", name: "Shipper", address: "695 Summa Ave", city: "Amityville", state: "NY", zip: "11701", date: "2026-07-06", appointment_required: true, pickup_number: "ss-0094-2540750" }),
      stop({ type: "delivery", name: "Consignee", address: "3909 S County Rd 1290", city: "Midland", state: "TX", zip: "79706", date: "2026-07-08", appointment_required: false }),
    ],
    equipment: "flatbed or step deck",
    commodity: "Wire Reels",
    weight: "26,999 lb",
    total_weight_lbs: 26999,
    pieces_count: 7,
    pieces_unit: "Reels",
    invoice_to_email: "ap@neon-logistics.com",
    terms: { detention_rate_per_hour_cents: 3500, detention_free_hours: 2, layover_per_day_cents: 25000, tonu_fee_cents: 15000 },
    rate: { linehaul_cents: 400000, fuel_surcharge_cents: null, accessorials: [], total_cents: 400000 },
    payment_terms: "Invoice to ap@neon-logistics.com",
    notes: "Detention $35/hr after 2 free hrs · layover $250 · TONU $150",
    field_confidence: {},
  };

  it("lands every previously-dropped field in its own place", () => {
    const p = rateConExtractionToPrefill(neon);
    expect(p.json.trailer_type).toBe("flatbed"); // equipment "flatbed or step deck" → flatbed
    expect(p.json.commodity).toBe("Wire Reels");
    expect(p.json.weight_lbs).toBe(26999);
    expect(p.json.pieces).toBe("7 Reels");
    expect(p.json.pickup_number).toBe("ss-0094-2540750"); // SS-load number → Pickup #
    expect(p.json.customer_wo_number).toBe("31420-32017"); // shipment id → Customer WO #
    const stops = p.json.stops as Array<Record<string, unknown>>;
    expect(stops[0]).toMatchObject({ address_line1: "695 Summa Ave", city: "Amityville", state: "NY", zip: "11701" });
  });

  it("carries the full broker contact for RATECON-5 profile enrichment", () => {
    const { brokerMatch } = rateConExtractionToPrefill(neon);
    expect(brokerMatch).toMatchObject({
      name: "Neon Logistics", mc_number: "1112163", contact_name: "Joey Reed",
      after_hours_phone: "480-555-0199", invoice_to_email: "ap@neon-logistics.com",
      detention_rate_per_hour_cents: 3500, detention_free_hours: 2, layover_per_day_cents: 25000,
    });
  });
});
